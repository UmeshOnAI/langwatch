import { useCallback, useEffect, useState } from "react";
import { useSocketClient } from "./useSocketClient";
import { useWorkflowStore } from "./useWorkflowStore";
import type { StudioClientEvent } from "../types/events";
import type { Node } from "@xyflow/react";
import type { BaseComponent, Component, Field } from "../types/dsl";
import { nanoid } from "nanoid";
import { useToast } from "@chakra-ui/react";

export const useWorkflowExecution = () => {
  const { sendMessage, socketStatus } = useSocketClient();

  const toast = useToast();

  const [triggerTimeout, setTriggerTimeout] = useState<{
    trace_id: string;
    timeout_on_status: "waiting" | "running";
  } | null>(null);

  const { getWorkflow, setWorkflowExecutionState } = useWorkflowStore(
    (state) => ({
      getWorkflow: state.getWorkflow,
      setWorkflowExecutionState: state.setWorkflowExecutionState,
    })
  );

  const socketAvailable = useCallback(() => {
    if (socketStatus !== "connected") {
      toast({
        title: "Studio is not connected",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return false;
    }
    return true;
  }, [socketStatus, toast]);

  useEffect(() => {
    const workflow = getWorkflow();
    if (
      triggerTimeout &&
      workflow.state.execution?.trace_id === triggerTimeout.trace_id &&
      workflow.state.execution?.status === triggerTimeout.timeout_on_status
    ) {
      setWorkflowExecutionState({
        status: "error",
        error: "Timeout",
        timestamps: { finished_at: Date.now() },
      });
      toast({
        title: `Timeout ${
          triggerTimeout.timeout_on_status === "waiting"
            ? "starting"
            : "stopping"
        } workflow execution`,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
  }, [triggerTimeout, setWorkflowExecutionState, getWorkflow, toast]);

  const startWorkflowExecution = useCallback(
    ({ untilNodeId }: { untilNodeId?: string }) => {
      if (!socketAvailable()) {
        return;
      }

      const trace_id = `trace_${nanoid()}`;

      setWorkflowExecutionState({
        status: "waiting",
        trace_id,
        until_node_id: untilNodeId,
      });

      const payload: StudioClientEvent = {
        type: "execute_flow",
        payload: {
          trace_id,
          workflow: getWorkflow(),
          until_node_id: untilNodeId,
        },
      };
      sendMessage(payload);

      setTimeout(() => {
        setTriggerTimeout({ trace_id, timeout_on_status: "waiting" });
      }, 10_000);
    },
    [socketAvailable, getWorkflow, sendMessage, setWorkflowExecutionState]
  );

  const stopWorkflowExecution = useCallback(
    ({
      trace_id,
      node_id,
    }: {
      trace_id: string;
      node_id: string;
      current_state: BaseComponent["execution_state"];
    }) => {
      if (!socketAvailable()) {
        return;
      }

      const workflow = getWorkflow();
      const current_state = workflow.state.execution?.status;
      if (current_state === "waiting") {
        setWorkflowExecutionState({
          status: "idle",
          trace_id: undefined,
        });
        return;
      }

      const payload: StudioClientEvent = {
        type: "stop_execution",
        payload: { trace_id, node_id },
      };
      sendMessage(payload);

      setTimeout(() => {
        setTriggerTimeout({
          trace_id,
          timeout_on_status: "running",
        });
      }, 2_000);
    },
    [socketAvailable, setWorkflowExecutionState, sendMessage, getWorkflow]
  );

  return {
    startWorkflowExecution,
    stopWorkflowExecution,
  };
};