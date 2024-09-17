import {
  Avatar,
  Box,
  Button,
  Divider,
  FormControl,
  HStack,
  Input,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverCloseButton,
  PopoverContent,
  PopoverHeader,
  PopoverTrigger,
  Portal,
  Tag,
  Text,
  Tooltip,
  useDisclosure,
  useToast,
  VStack,
} from "@chakra-ui/react";

import { useCallback, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { HistoryIcon } from "../../components/icons/History";
import { SmallLabel } from "../../components/SmallLabel";
import { useOrganizationTeamProject } from "../../hooks/useOrganizationTeamProject";
import { api } from "../../utils/api";
import { formatTimeAgo } from "../../utils/formatTimeAgo";
import { useWorkflowStore } from "../hooks/useWorkflowStore";
import isDeepEqual from "fast-deep-equal";
import type { Workflow } from "../types/dsl";

export const hasDSLChange = (dslCurrent: Workflow, dslPrevious: Workflow) => {
  const clearDsl = (dsl: Workflow) => {
    return {
      ...dsl,
      version: undefined,
      edges: dsl.edges.map((edge) => {
        const edge_ = { ...edge };
        delete edge_.selected;
        return edge_;
      }),
      nodes: dsl.nodes.map((node) => {
        const node_ = { ...node, data: { ...node.data } };
        delete node_.selected;
        return node_;
      }),
    };
  };

  return !isDeepEqual(clearDsl(dslCurrent), clearDsl(dslPrevious));
};

export function History() {
  const { isOpen, onToggle, onClose } = useDisclosure();

  return (
    <Popover isOpen={isOpen} onClose={onClose} closeOnBlur={false}>
      <PopoverTrigger>
        <Button variant="ghost" color="gray.500" size="xs" onClick={onToggle}>
          <HistoryIcon size={16} />
        </Button>
      </PopoverTrigger>
      <Portal>
        <Box zIndex="popover" position="relative">
          {isOpen && <HistoryPopover onClose={onClose} />}
        </Box>
      </Portal>
    </Popover>
  );
}

export function HistoryPopover({ onClose }: { onClose: () => void }) {
  const { project } = useOrganizationTeamProject();
  const {
    workflowId,
    version,
    getWorkflow,
    setWorkflow,
    setPreviousWorkflow,
    previousWorkflow,
  } = useWorkflowStore(
    ({
      workflowId,
      version,
      getWorkflow,
      setWorkflow,
      setPreviousWorkflow,
      previousWorkflow,
    }) => ({
      workflowId,
      version,
      getWorkflow,
      setWorkflow,
      setPreviousWorkflow,
      previousWorkflow,
    })
  );
  const form = useForm<{ version: string; commitMessage: string }>({
    defaultValues: {
      version: "",
      commitMessage: "",
    },
  });

  const versions = api.workflow.getVersions.useQuery(
    {
      projectId: project?.id ?? "",
      workflowId: workflowId ?? "",
    },
    { enabled: !!project?.id && !!workflowId }
  );
  const currentVersion = versions.data?.find(
    (version) => version.isCurrentVersion
  );
  const latestVersion = versions.data?.find(
    (version) => version.isLatestVersion
  );
  const hasChanges = previousWorkflow
    ? hasDSLChange(getWorkflow(), previousWorkflow)
    : false;
  const canSaveNewVersion =
    currentVersion && (hasChanges || currentVersion.autoSaved);
  const commitVersion = api.workflow.commitVersion.useMutation();
  const restoreVersion = api.workflow.restoreVersion.useMutation();

  const toast = useToast();

  const onSubmit = ({
    version,
    commitMessage,
  }: {
    version: string;
    commitMessage: string;
  }) => {
    if (!project || !workflowId) return;

    commitVersion.mutate(
      {
        projectId: project.id,
        workflowId,
        commitMessage,
        dsl: {
          ...getWorkflow(),
          version,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: `Saved version ${version}`,
            status: "success",
            duration: 5000,
            isClosable: true,
            position: "top-right",
          });
          setWorkflow({
            version,
          });
          void versions.refetch();
        },
        onError: (error) => {
          toast({
            title: "Error saving version",
            description: error.message,
            status: "error",
            duration: 5000,
            isClosable: true,
            position: "top-right",
          });
        },
      }
    );
  };

  const [versionMajor, versionMinor] = version.split(".");
  const nextVersion = useMemo(() => {
    return latestVersion?.autoSaved
      ? latestVersion.version
      : `${versionMajor}.${parseInt(versionMinor ?? "0") + 1}`;
  }, [versionMajor, versionMinor, latestVersion]);

  useEffect(() => {
    form.setValue("version", nextVersion);
  }, [nextVersion, form]);

  const onRestore = useCallback(
    async (versionId: string) => {
      if (!project || !workflowId) return;

      if (currentVersion?.autoSaved) {
        if (!confirm("Autosaved changes might be lost. Continue?")) {
          return;
        }
      } else if (hasChanges) {
        if (!confirm("Unsaved changes will be lost. Continue?")) {
          return;
        }
      }

      const version = await restoreVersion.mutateAsync({
        projectId: project.id,
        versionId,
      });

      // Prevent autosave from triggering after restore
      setPreviousWorkflow(undefined);
      setWorkflow(version.dsl as unknown as Workflow);
      onClose();
    },
    [
      project,
      workflowId,
      currentVersion?.autoSaved,
      hasChanges,
      restoreVersion,
      setWorkflow,
      setPreviousWorkflow,
      onClose,
    ]
  );

  return (
    <PopoverContent width="500px">
      <PopoverArrow />
      <PopoverHeader fontWeight={600}>Workflow Versions</PopoverHeader>
      <PopoverCloseButton />
      <PopoverBody padding={0}>
        <form
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          onSubmit={form.handleSubmit(onSubmit)}
          style={{ width: "100%", padding: "12px" }}
        >
          <VStack align="start" width="full">
            <HStack width="full">
              <FormControl
                width="fit-content"
                isInvalid={!!form.formState.errors.version}
              >
                <VStack align="start">
                  <SmallLabel color="gray.600">Version</SmallLabel>
                  <Input
                    {...form.register("version", {
                      required: true,
                      pattern: /^\d+\.\d+$/,
                    })}
                    placeholder={nextVersion}
                    maxWidth="90px"
                    pattern="\d+\.\d+"
                    isDisabled={!canSaveNewVersion}
                  />
                </VStack>
              </FormControl>
              <FormControl
                width="full"
                isInvalid={!!form.formState.errors.commitMessage}
              >
                <VStack align="start" width="full">
                  <SmallLabel color="gray.600">Description</SmallLabel>
                  <Input
                    {...form.register("commitMessage", {
                      required: true,
                    })}
                    placeholder="What changes have you made?"
                    width="full"
                    isDisabled={!canSaveNewVersion}
                  />
                </VStack>
              </FormControl>
            </HStack>
            <Tooltip label={!canSaveNewVersion ? "No changes to save" : ""}>
              <Button
                type="submit"
                alignSelf="end"
                colorScheme="orange"
                size="sm"
                isLoading={commitVersion.isLoading}
                isDisabled={!canSaveNewVersion}
              >
                Save new version
              </Button>
            </Tooltip>
          </VStack>
        </form>
        <Divider borderBottomWidth="2px" />
        <VStack
          align="start"
          width="full"
          padding={3}
          maxHeight="500px"
          overflowY="auto"
        >
          <Text fontWeight={600} fontSize={16} paddingTop={2}>
            Previous Versions
          </Text>
          {versions.data?.map((version) => (
            <VStack
              key={version.id}
              width="full"
              align="start"
              paddingBottom={2}
            >
              <Divider marginBottom={2} />
              <HStack width="full" spacing={3}>
                <Box
                  padding={3}
                  backgroundColor={
                    version.autoSaved ? "orange.50" : "orange.100"
                  }
                  borderRadius={6}
                  fontWeight={600}
                  fontSize={13}
                  color="gray.600"
                  whiteSpace="nowrap"
                  textAlign="center"
                  minWidth="48px"
                  height="44px"
                >
                  {version.autoSaved ? " " : version.version}
                </Box>
                <VStack align="start" width="full" spacing={1}>
                  <HStack>
                    <Text fontWeight={600} fontSize={13} noOfLines={1}>
                      {version.commitMessage}
                    </Text>
                    {version.isCurrentVersion && (
                      <Tag colorScheme="green" size="sm" paddingX={2}>
                        current
                      </Tag>
                    )}
                  </HStack>
                  <HStack>
                    <Avatar
                      name={version.author?.name ?? ""}
                      backgroundColor={"orange.400"}
                      color="white"
                      size="2xs"
                    />
                    <Text fontSize={12}>
                      {version.author?.name}
                      {" · "}
                      <Tooltip
                        label={new Date(version.updatedAt).toLocaleString()}
                      >
                        {formatTimeAgo(version.updatedAt.getTime())}
                      </Tooltip>
                    </Text>
                  </HStack>
                </VStack>
                {!version.isCurrentVersion && (
                  <Tooltip label="Restore this version">
                    <Button
                      variant="ghost"
                      onClick={() => void onRestore(version.id)}
                      isLoading={restoreVersion.isLoading}
                    >
                      <HistoryIcon size={24} />
                    </Button>
                  </Tooltip>
                )}
              </HStack>
            </VStack>
          ))}
        </VStack>
      </PopoverBody>
    </PopoverContent>
  );
}