import { type ColDef } from "@ag-grid-community/core";
import { DownloadIcon } from "@chakra-ui/icons";
import {
  Button,
  Card,
  CardBody,
  Checkbox,
  Container,
  HStack,
  Heading,
  Spacer,
  Text,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import Parse from "papaparse";
import { useCallback, useMemo, useRef, useState } from "react";
import { Play, Upload } from "react-feather";
import { useOrganizationTeamProject } from "../../hooks/useOrganizationTeamProject";
import { type DatasetColumnType } from "../../server/datasets/types";
import { api } from "../../utils/api";
import { useDrawer } from "../CurrentDrawer";
import { DatasetGrid, HeaderCheckboxComponent } from "./DatasetGrid";

import type { CustomCellRendererProps } from "@ag-grid-community/react";
import { UploadCSVModal } from "./UploadCSVModal";

export function DatasetTable() {
  const router = useRouter();
  const { project } = useOrganizationTeamProject();
  const datasetId = router.query.id;

  const { openDrawer } = useDrawer();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [savingStatus, setSavingStatus] = useState<"saving" | "saved" | "">("");

  const dataset = api.datasetRecord.getAll.useQuery(
    { projectId: project?.id ?? "", datasetId: datasetId as string },
    {
      enabled: !!project,
      refetchOnWindowFocus: false,
    }
  );

  const columnDefs = useMemo(() => {
    if (!dataset.data) return [];

    const headers: (ColDef & { type: DatasetColumnType })[] = Object.entries(
      dataset.data.columnTypes ?? {}
    ).map(([field, type]) => ({
      headerName: field,
      field,
      type,
      cellClass: "v-align",
      sortable: false,
    }));

    // Add row number column
    headers.unshift({
      headerName: "#",
      valueGetter: "node.rowIndex + 1",
      type: "number",
      width: 42,
      pinned: "left",
      sortable: false,
      filter: false,
      editable: false,
    });

    // Add select column
    headers.unshift({
      headerName: "",
      field: "selected",
      type: "boolean",
      width: 46,
      pinned: "left",
      sortable: false,
      filter: false,
      editable: false,
      enableCellChangeFlash: false,
      headerComponent: HeaderCheckboxComponent,
      cellRenderer: (props: CustomCellRendererProps) => (
        <Checkbox
          marginLeft="3px"
          {...props}
          isChecked={props.value}
          onChange={(e) => props.setValue?.(e.target.checked)}
        />
      ),
    });

    return headers;
  }, [dataset.data]);

  const rowData = useMemo(() => {
    if (!dataset.data) return;

    const columns = Object.keys(dataset.data.columnTypes ?? {});
    return dataset.data.datasetRecords.map((record) => {
      const row: Record<string, any> = { id: record.id };
      columns.forEach((col) => {
        const value = (record.entry as any)[col];
        row[col] = typeof value === "object" ? JSON.stringify(value) : value;
      });
      return row;
    });
  }, [dataset.data]);

  // const deleteDatasetRecord = api.datasetRecord.delete.useMutation();
  const toast = useToast();

  const downloadCSV = () => {
    const columns = Object.keys(dataset.data?.columnTypes ?? {}) ?? [];
    const csvData =
      dataset.data?.datasetRecords.map((record) =>
        columns.map((col) => {
          const value = (record.entry as any)[col];
          return typeof value === "object" ? JSON.stringify(value) : value;
        })
      ) ?? [];

    const csv = Parse.unparse({
      fields: columns,
      data: csvData,
    });

    const url = window.URL.createObjectURL(new Blob([csv]));

    const link = document.createElement("a");
    link.href = url;
    const fileName = `${dataset.data?.name}.csv`;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const timeoutRef = useRef<NodeJS.Timeout>(null);

  const updateDatasetRecord = api.datasetRecord.update.useMutation();
  const onCellValueChanged = useCallback(
    (params: any) => {
      setSavingStatus("saving");
      const updatedRecord = params.data;
      updateDatasetRecord.mutate(
        {
          projectId: project?.id ?? "",
          datasetId: datasetId as string,
          recordId: params.data.id,
          updatedRecord,
        },
        {
          onSuccess: () => {
            setSavingStatus("saved");
            if (timeoutRef.current) {
              clearInterval(timeoutRef.current);
            }
            //@ts-ignore
            timeoutRef.current = setTimeout(() => {
              setSavingStatus("");
            }, 3000);
          },
          onError: () => {
            toast({
              title: "Error updating record.",
              description: "Changes will be reverted, please try again",
              status: "error",
              duration: 5000,
              isClosable: true,
            });
            void dataset.refetch();
            setSavingStatus("");
          },
        }
      );
    },
    [updateDatasetRecord, project?.id, datasetId, toast, dataset]
  );

  return (
    <>
      <Container maxW={"calc(100vw - 200px)"} padding={6} marginTop={8}>
        <HStack width="full" verticalAlign={"middle"} paddingBottom={6}>
          <Heading as={"h1"} size="lg">
            Dataset {`- ${dataset.data?.name ?? ""}`}
          </Heading>
          <HStack padding={2}>
            <Text fontSize={"12px"} color="gray.400">
              {savingStatus === "saving"
                ? "Saving..."
                : savingStatus === "saved"
                ? "Saved"
                : ""}
            </Text>
          </HStack>
          <Spacer />
          <Button
            onClick={() => onOpen()}
            rightIcon={<Upload height={17} width={17} strokeWidth={2.5} />}
          >
            Upload CSV
          </Button>
          <Button
            colorScheme="black"
            minWidth="fit-content"
            variant="ghost"
            onClick={() => dataset.data && downloadCSV()}
          >
            Export <DownloadIcon marginLeft={2} />
          </Button>
          <Button
            colorScheme="blue"
            onClick={() => {
              openDrawer("batchEvaluation", {
                datasetSlug: dataset.data?.slug,
              });
            }}
            minWidth="fit-content"
            leftIcon={<Play height={16} />}
          >
            Batch Evaluation
          </Button>
        </HStack>
        <Card>
          <CardBody padding={0}>
            <DatasetGrid
              columnDefs={columnDefs}
              rowData={rowData}
              onCellValueChanged={onCellValueChanged}
            />
          </CardBody>
        </Card>
        <UploadCSVModal
          isOpen={isOpen}
          onClose={onClose}
          datasetId={datasetId as string}
        />
      </Container>
    </>
  );
}