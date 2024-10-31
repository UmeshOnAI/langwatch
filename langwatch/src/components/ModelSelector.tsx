import { Box, HStack, Text } from "@chakra-ui/react";
import { Select as MultiSelect, chakraComponents } from "chakra-react-select";
import React from "react";
import models from "../../../models.json";
import { useOrganizationTeamProject } from "../hooks/useOrganizationTeamProject";
import { api } from "../utils/api";
import {
  vendorIcons,
  modelProviderIcons,
} from "../server/modelProviders/iconsMap";

export type ModelOption = {
  label: string;
  value: string;
  version: string;
  icon: React.ReactNode;
  isDisabled: boolean;
  mode?: "chat" | "embedding" | "evaluator" | undefined;
};

export const modelSelectorOptions: ModelOption[] = Object.entries(models).map(
  ([key, value]) => ({
    label: value.name,
    value: key,
    version: value.version,
    icon: vendorIcons[value.model_vendor],
    isDisabled: false,
    mode: value.mode as "chat" | "embedding" | "evaluator",
  })
);

export const allModelOptions = modelSelectorOptions.map(
  (option) => option.value
);

export const useModelSelectionOptions = (
  options: string[],
  model: string,
  mode: "chat" | "embedding" | "evaluator" = "chat"
) => {
  const { project } = useOrganizationTeamProject();
  const modelProviders = api.modelProvider.getAllForProject.useQuery(
    { projectId: project?.id ?? "" },
    { enabled: !!project?.id }
  );

  console.log(modelProviders.data);

  const customModels = getCustomModels(
    modelProviders.data ?? {},
    options,
    mode
  );

  console.log("customModels", customModels);

  const selectOptions: Record<string, ModelOption> = Object.fromEntries(
    customModels.map((model): [string, ModelOption] => {
      const provider = model.split("/")[0]!;
      const modelName = model.split("/")[1]!;

      return [
        model,
        {
          label: modelName,
          value: model,
          version: "",
          icon: modelProviderIcons[provider as keyof typeof modelProviderIcons],
          isDisabled: !modelProviders.data?.[provider]?.enabled,
          mode: mode,
        },
      ];
    })
  );

  const modelOption = selectOptions[model];

  return { modelOption, selectOptions: Object.values(selectOptions) };
};

export const ModelSelector = React.memo(function ModelSelector({
  model,
  options,
  onChange,
  size = "md",
  mode,
}: {
  model: string;
  options: string[];
  onChange: (model: string) => void;
  size?: "sm" | "md" | "full";
  mode?: "chat" | "embedding" | "evaluator";
}) {
  const { modelOption, selectOptions } = useModelSelectionOptions(
    options,
    model,
    mode
  );

  return (
    <MultiSelect
      className="fix-hidden-inputs"
      value={modelOption}
      onChange={(option) => option && onChange(option.value)}
      options={selectOptions}
      isSearchable={false}
      chakraStyles={{
        container: (base) => ({
          ...base,
          background: "white",
          width: size === "full" ? "100%" : "auto",
          borderRadius: "5px",
          padding: 0,
        }),
        valueContainer: (base) => ({
          ...base,
          padding: size === "sm" ? "0px 8px" : "0px 12px",
        }),
        control: (base) => ({
          ...base,
          minHeight: 0,
          height: size === "sm" ? "32px" : "40px",
        }),
        dropdownIndicator: (provided) => ({
          ...provided,
          background: "white",
          padding: 0,
          paddingRight: 2,
          width: "auto",
          border: "none",
        }),
        indicatorSeparator: (provided) => ({
          ...provided,
          display: "none",
        }),
      }}
      components={{
        Option: ({ children, ...props }) => (
          <chakraComponents.Option {...props}>
            <HStack spacing={2} align="center">
              <Box width="14px">{props.data.icon}</Box>
              <Box fontSize={size === "sm" ? 12 : 14} fontFamily="mono">
                {children}
                {(!!props.data.version || props.data.isDisabled) && (
                  <>
                    {" "}
                    <Text
                      display="inline-block"
                      fontSize={size === "sm" ? 12 : 14}
                      fontFamily="mono"
                      color="gray.400"
                    >
                      ({props.data.value ? props.data.version : "disabled"})
                    </Text>
                  </>
                )}
              </Box>
            </HStack>
          </chakraComponents.Option>
        ),
        ValueContainer: ({ children, ...props }) => {
          const { getValue } = props;
          const value = getValue();
          const icon = value.length > 0 ? value[0]?.icon : null;
          const version = value.length > 0 ? value[0]?.version : null;
          const model = value.length > 0 ? value[0]?.value : null;
          const isDisabled =
            selectOptions.find((option) => option.value === model)
              ?.isDisabled ?? true;

          return (
            <chakraComponents.ValueContainer {...props}>
              <HStack
                overflow="hidden"
                spacing={2}
                align="center"
                opacity={isDisabled ? 0.5 : 1}
              >
                <Box minWidth={size === "sm" ? "14px" : "16px"}>{icon}</Box>
                <Box fontSize={size === "sm" ? 12 : 14} fontFamily="mono">
                  {children}
                </Box>
                {(!!version || isDisabled) && (
                  <Text
                    fontSize={size === "sm" ? 12 : 14}
                    fontFamily="mono"
                    color="gray.400"
                  >
                    ({isDisabled ? "disabled" : version})
                  </Text>
                )}
              </HStack>
            </chakraComponents.ValueContainer>
          );
        },
      }}
    />
  );
});

const getCustomModels = (
  modelProviders: Record<string, any>,
  options: string[],
  mode: "chat" | "embedding" | "evaluator" = "chat"
) => {
  const models: string[] = [];

  const customProviders: string[] = [];

  for (const provider in modelProviders) {
    if (
      modelProviders[provider].enabled &&
      modelProviders[provider].customModels &&
      mode === "chat"
    ) {
      modelProviders[provider].customModels.forEach((model: string) => {
        models.push(`${provider}/${model}`);
        customProviders.push(provider);
      });
    }

    if (
      modelProviders[provider].enabled &&
      modelProviders[provider].customEmbeddingsModels &&
      mode === "embedding"
    ) {
      modelProviders[provider].customEmbeddingsModels?.forEach(
        (model: string) => {
          models.push(`${provider}/${model}`);
          customProviders.push(provider);
        }
      );
    }
  }

  if (customProviders.length > 0) {
    options.forEach((option) => {
      const optionProvider = option.split("/")[0]!;
      if (!customProviders.includes(optionProvider)) {
        models.push(option);
      }
    });
    return models;
  }

  return options;
};
