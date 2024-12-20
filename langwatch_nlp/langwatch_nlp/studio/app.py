import asyncio
from contextlib import asynccontextmanager
from multiprocessing import Process, Queue
from multiprocessing.synchronize import Event
import os
from queue import Empty
import queue
import signal
import sys
import threading
import time
import traceback
from typing import AsyncGenerator, Dict, TypedDict
from fastapi import FastAPI, Response, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
import json

from langwatch_nlp.studio.dspy.evaluation import EvaluationReporting
from langwatch_nlp.studio.execute.execute_component import execute_component
from langwatch_nlp.studio.execute.execute_evaluation import (
    error_evaluation_event,
    execute_evaluation,
)
from langwatch_nlp.studio.execute.execute_flow import execute_flow
from langwatch_nlp.studio.execute.execute_optimization import (
    error_optimization_event,
    execute_optimization,
)
from langwatch_nlp.studio.process_pool import IsolatedProcessPool
from langwatch_nlp.studio.types.events import (
    Debug,
    DebugPayload,
    Done,
    ExecuteOptimization,
    ExecutionStateChange,
    IsAliveResponse,
    StopEvaluationExecution,
    StopExecution,
    StopOptimizationExecution,
    StudioClientEvent,
    StudioServerEvent,
    Error,
    ErrorPayload,
    component_error_event,
)


pool: IsolatedProcessPool[StudioClientEvent, StudioServerEvent]


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pool
    pool = IsolatedProcessPool(event_worker, size=4)

    if os.getenv("RUNNING_IN_DOCKER"):
        signal.signal(signal.SIGTERM, shutdown_handler)
        signal.signal(signal.SIGINT, shutdown_handler)

    yield

    pool.shutdown()


app = FastAPI(lifespan=lifespan)


async def execute_event(
    event: StudioClientEvent,
    queue: "Queue[StudioServerEvent]",
) -> AsyncGenerator[StudioServerEvent, None]:
    yield Debug(payload=DebugPayload(message="server starting execution"))

    try:
        match event.type:
            case "is_alive":
                yield IsAliveResponse()
            case "execute_component":
                try:
                    async for event_ in execute_component(event.payload):
                        yield event_
                except Exception as e:
                    yield component_error_event(
                        trace_id=event.payload.trace_id,
                        node_id=event.payload.node_id,
                        error=repr(e),
                    )
            case "execute_flow":
                try:
                    async for event_ in execute_flow(event.payload, queue):
                        yield event_
                except Exception as e:
                    traceback.print_exc()
                    yield Error(payload=ErrorPayload(message=repr(e)))
            case "execute_evaluation":
                try:
                    async for event_ in execute_evaluation(event.payload, queue):
                        yield event_
                except Exception as e:
                    yield Error(payload=ErrorPayload(message=repr(e)))
            case "execute_optimization":
                try:
                    async for event_ in execute_optimization(event.payload, queue):
                        yield event_
                except Exception as e:
                    yield Error(payload=ErrorPayload(message=repr(e)))
            case _:
                yield Error(
                    payload=ErrorPayload(
                        message=f"Unknown event type from client: {event.type}"
                    )
                )

    except Exception as e:
        yield Error(payload=ErrorPayload(message=repr(e)))

    yield Done()


def event_worker(
    ready_event: Event,
    queue_in: "Queue[StudioClientEvent | None]",
    queue_out: "Queue[StudioServerEvent]",
):
    ready_event.set()
    signal.signal(signal.SIGUSR1, shutdown_handler)
    while True:
        try:
            event = queue_in.get(timeout=1)
            if event is None:  # Sentinel to exit
                break
            try:

                async def async_execute_event(event):
                    async for event_ in execute_event(event, queue_out):
                        queue_out.put(event_)

                asyncio.run(async_execute_event(event))
            except Exception as e:
                queue_out.put(Error(payload=ErrorPayload(message=repr(e))))
        except queue.Empty:
            continue


def shutdown_handler(sig, frame):
    timer = threading.Timer(3.0, forceful_exit)
    timer.start()

    try:
        sys.exit(0)
    finally:
        timer.cancel()


def forceful_exit():
    print("Forceful exit triggered", file=sys.stderr)
    os._exit(1)


class RunningProcess(TypedDict):
    process: Process
    queue: "Queue[StudioServerEvent]"


running_processes: Dict[str, RunningProcess] = {}


# We execute events on a subprocess because each user might execute completely different code,
# which can alter the global Python interpreter state in unpredictable ways. DSPy itself does
# a lot of this. At same time, we want to fork the main process to avoid double RAM spending and
# startup times.
async def execute_event_on_a_subprocess(event: StudioClientEvent):
    if isinstance(event, StopExecution):
        if event.payload.trace_id in running_processes:
            await stop_process(event.payload.trace_id)
            if event.payload.node_id:
                yield component_error_event(
                    trace_id=event.payload.trace_id,
                    node_id=event.payload.node_id,
                    error="Interrupted",
                )
            else:
                yield Error(payload=ErrorPayload(message="Interrupted"))
        return

    if isinstance(event, StopEvaluationExecution):
        if event.payload.run_id in running_processes:
            await stop_process(event.payload.run_id)
            EvaluationReporting.post_results(
                event.payload.workflow.api_key,
                {
                    "experiment_slug": event.payload.workflow.workflow_id,
                    "run_id": event.payload.run_id,
                    "timestamps": {
                        "finished_at": int(time.time() * 1000),
                        "stopped_at": int(time.time() * 1000),
                    },
                },
            )
            yield error_evaluation_event(
                run_id=event.payload.run_id,
                error="Evaluation Stopped",
                stopped_at=int(time.time() * 1000),
            )
        return

    if isinstance(event, StopOptimizationExecution):
        if event.payload.run_id in running_processes:
            await stop_process(event.payload.run_id)
            yield error_optimization_event(
                run_id=event.payload.run_id,
                error="Optimization Stopped",
                stopped_at=int(time.time() * 1000),
            )
        return

    process, queue = await pool.submit(event)

    trace_id = get_trace_id(event)
    if trace_id and trace_id not in running_processes:
        running_processes[trace_id] = RunningProcess(process=process, queue=queue)

    timeout_without_messages = 120  # seconds
    if isinstance(event, ExecuteOptimization):
        # TODO: temporary until we actually send events in the middle of optimization process
        timeout_without_messages = 120 * 60  # 120 minutes

    try:
        done = False
        last_message_time = time.time()
        time_since_last_message = 0
        while time_since_last_message < timeout_without_messages:
            time_since_last_message = time.time() - last_message_time
            try:
                result = queue.get(block=False)
                yield result
                last_message_time = time.time()

                if isinstance(result, Done):
                    done = True
                    break
            except Empty:
                if timeout_without_messages > 10 and not process.is_alive():
                    raise Exception("Runtime crashed")

                await asyncio.sleep(0.1)

        if not done:
            # Timeout occurred
            yield Error(payload=ErrorPayload(message="Execution timed out"))
            kill_process(process)

    except Exception as e:
        yield Error(payload=ErrorPayload(message=f"Unexpected error: {repr(e)}"))
    finally:
        # Ensure the process is terminated and resources are cleaned up
        if process.is_alive():
            kill_process(process)

        trace_id = get_trace_id(event)
        if trace_id and trace_id in running_processes:
            del running_processes[trace_id]


def get_trace_id(event: StudioClientEvent):
    return (
        event.payload.trace_id  # type: ignore
        if hasattr(event.payload, "trace_id")
        else (
            event.payload.run_id  # type: ignore
            if hasattr(event.payload, "run_id")
            else None
        )
    )


async def stop_process(trace_id: str):
    queue = running_processes[trace_id]["queue"]
    queue.put(Done())

    await asyncio.sleep(0.2)

    # Check again because the process generally finishes gracefully on its own
    if trace_id in running_processes:
        process = running_processes[trace_id]["process"]
        kill_process(process)

        del running_processes[trace_id]


def kill_process(process: Process):
    if process.pid is None:
        return
    os.kill(process.pid, signal.SIGUSR1)


async def event_encoder(event_generator: AsyncGenerator[StudioServerEvent, None]):
    async for event in event_generator:
        yield f"data: {json.dumps(event.model_dump(exclude_none=True))}\n\n"


@app.post("/execute")
async def execute(
    event: StudioClientEvent, response: Response, background_tasks: BackgroundTasks
):
    print(f"Received event for execution: {event}", flush=True)
    response.headers["Cache-Control"] = "no-cache"
    return StreamingResponse(
        event_encoder(execute_event_on_a_subprocess(event)),
        media_type="text/event-stream",
    )


@app.post("/execute_sync")
async def execute_sync(event: StudioClientEvent):
    print(f"Received event for sync execution: {event}", flush=True)

    event_stream = execute_event_on_a_subprocess(event)

    # Monitor the stream for the "success" state
    async for response in event_stream:
        if isinstance(response, ExecutionStateChange):
            status = response.payload.execution_state.status

            if status == "success":
                return {
                    "trace_id": response.payload.execution_state.trace_id,
                    "status": "success",
                    "result": (
                        response.payload.execution_state.result.get("end")
                        if response.payload.execution_state.result
                        else None
                    ),
                }
            elif status == "error":
                raise HTTPException(
                    status_code=500, detail=response.payload.execution_state.error
                )

    # If the loop completes without finding success or error
    raise HTTPException(
        status_code=500, detail="Execution completed without success or error status"
    )
