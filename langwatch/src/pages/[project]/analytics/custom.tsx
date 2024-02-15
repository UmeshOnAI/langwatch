import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Button,
  Card,
  CardBody,
  Center,
  Container,
  FormControl,
  FormLabel,
  HStack,
  Heading,
  Input,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Select,
  Spacer,
  Switch,
  Text,
  VStack,
  useTheme,
} from "@chakra-ui/react";
import { Select as MultiSelect, chakraComponents } from "chakra-react-select";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { BarChart2, Trash, TrendingUp, Triangle } from "react-feather";
import {
  Controller,
  useFieldArray,
  useForm,
  type FieldArrayWithId,
  type UseFieldArrayReturn,
} from "react-hook-form";
import { DashboardLayout } from "../../../components/DashboardLayout";
import { FilterSelector } from "../../../components/FilterSelector";
import {
  PeriodSelector,
  usePeriodSelector,
} from "../../../components/PeriodSelector";
import {
  CustomGraph,
  type CustomGraphInput,
} from "../../../components/analytics/CustomGraph";
import {
  analyticsGroups,
  analyticsMetrics,
  analyticsPipelines,
  getMetric,
  metricAggregations,
  pipelineAggregations,
  type FlattenAnalyticsGroupsEnum,
  type FlattenAnalyticsMetricsEnum,
} from "../../../server/analytics/registry";
import type {
  AggregationTypes,
  AnalyticsGroup,
  AnalyticsMetric,
  PipelineAggregationTypes,
  PipelineFields,
} from "../../../server/analytics/types";
import {
  rotatingColors,
  type RotatingColorSet,
} from "../../../utils/rotatingColors";
import {
  camelCaseToTitleCase,
  uppercaseFirstLetterLowerCaseRest,
} from "../../../utils/stringCasing";
import { useDebounceValue } from "usehooks-ts";

export interface CustomGraphFormData {
  graphType: {
    label: string;
    value: CustomGraphInput["graphType"];
    icon: React.ReactNode;
  };
  series: {
    name: string;
    colorSet: RotatingColorSet;
    metric: FlattenAnalyticsMetricsEnum;
    aggregation: AggregationTypes;
    pipeline: {
      field: PipelineFields | "";
      aggregation: PipelineAggregationTypes;
    };
  }[];
  groupBy: FlattenAnalyticsGroupsEnum | "";
  includePrevious: boolean;
}

const chartOptions: CustomGraphFormData["graphType"][] = [
  {
    label: "Line Chart",
    value: "line",
    icon: <TrendingUp />,
  },
  {
    label: "Area Chart",
    value: "area",
    icon: <Triangle />,
  },
  {
    label: "Stacked Area Chart",
    value: "stacked_area",
    icon: <Triangle />,
  },
  {
    label: "Bar Chart",
    value: "bar",
    icon: <BarChart2 />,
  },
  {
    label: "Stacked Bar Chart",
    value: "stacked_bar",
    icon: <BarChart2 />,
  },
];

const defaultValues: CustomGraphFormData = {
  graphType: chartOptions[0]!,
  series: [
    {
      name: "Messages count",
      colorSet: "orangeTones",
      metric: "metadata.trace_id",
      aggregation: "cardinality",
      pipeline: {
        field: "",
        aggregation: "avg",
      },
    },
  ],
  groupBy: "",
  includePrevious: true,
};

export default function AnalyticsCustomGraph() {
  const form = useForm<CustomGraphFormData>({
    defaultValues,
  });
  const seriesFields = useFieldArray({
    control: form.control,
    name: "series",
  });
  const {
    period: { startDate, endDate },
    setPeriod,
  } = usePeriodSelector();

  const formData = JSON.stringify(form.watch() ?? {});
  const [debouncedFormData, setDebouncedFormData] = useDebounceValue(
    formData,
    400
  );

  useEffect(() => {
    setDebouncedFormData(formData);
  }, [formData, setDebouncedFormData]);

  return (
    <DashboardLayout>
      <Container maxWidth="1600" padding={6}>
        <VStack width="full" align="start" spacing={6}>
          <HStack width="full" align="top">
            <Heading as={"h1"} size="lg" paddingTop={1}>
              Custom Graph
            </Heading>
            <Spacer />
            <FilterSelector />
            <PeriodSelector
              period={{ startDate, endDate }}
              setPeriod={setPeriod}
            />
          </HStack>
          <Card width="full">
            <CardBody>
              <HStack width="full" align="start" minHeight="500px" spacing={8}>
                <CustomGraphForm form={form} seriesFields={seriesFields} />
                <Box border="1px solid" borderColor="gray.200" width="full">
                  <CustomGraph
                    input={customGraphFormToCustomGraphInput(
                      JSON.parse(debouncedFormData) as CustomGraphFormData
                    )}
                  />
                </Box>
              </HStack>
            </CardBody>
          </Card>
        </VStack>
      </Container>
    </DashboardLayout>
  );
}

const customGraphFormToCustomGraphInput = (
  formData: CustomGraphFormData
): CustomGraphInput => {
  return {
    graphId: "custom",
    graphType: formData.graphType.value,
    series: formData.series.map((series) => {
      if (series.pipeline.field) {
        return {
          ...series,
          pipeline: {
            ...series.pipeline,
            field: series.pipeline.field,
          },
        };
      }
      return {
        name: series.name,
        colorSet: series.colorSet,
        metric: series.metric,
        aggregation: series.aggregation,
      };
    }),
    groupBy: formData.groupBy || undefined,
    includePrevious: formData.includePrevious,
  };
};

function CustomGraphForm({
  form,
  seriesFields,
}: {
  form: ReturnType<typeof useForm<CustomGraphFormData>>;
  seriesFields: UseFieldArrayReturn<CustomGraphFormData, "series", "id">;
}) {
  const [expandedSeries, setExpandedSeries] = useState<number | number[]>([0]);
  const groupByField = form.control.register("groupBy");

  return (
    <VStack width="full" align="start" spacing={4} maxWidth="500px">
      <FormControl>
        <FormLabel>Graph Type</FormLabel>
        <GraphTypeField form={form} />
      </FormControl>
      <FormControl>
        <FormLabel fontSize={16}>Series</FormLabel>
        <Accordion
          width="full"
          allowMultiple={true}
          index={expandedSeries}
          onChange={(index) => setExpandedSeries(index)}
        >
          {seriesFields.fields.map((field, index) => (
            <SeriesFieldItem
              key={field.id}
              form={form}
              field={field}
              index={index}
              seriesFields={seriesFields}
              setExpandedSeries={setExpandedSeries}
            />
          ))}
        </Accordion>
        <Button
          onClick={() => {
            const index = seriesFields.fields.length;
            seriesFields.append(
              {
                name: "Users count",
                colorSet: "blueTones",
                metric: "metadata.user_id",
                aggregation: "cardinality",
                pipeline: {
                  field: "",
                  aggregation: "avg",
                },
              },
              { shouldFocus: false }
            );
            setTimeout(() => {
              form.resetField(`series.${index}.name`, {
                defaultValue: "Users count",
              });
            }, 0);
            setExpandedSeries([index]);
            if (!form.getFieldState("includePrevious")?.isTouched) {
              form.setValue("includePrevious", false);
            }
          }}
        >
          Add Series
        </Button>
      </FormControl>
      <FormControl>
        <FormLabel>Group by</FormLabel>
        <Select
          {...groupByField}
          onClick={(e) => {
            if (!form.getFieldState("includePrevious")?.isTouched) {
              form.setValue("includePrevious", false);
            }

            void groupByField.onChange(e);
          }}
          minWidth="fit-content"
        >
          <option value="">No grouping</option>
          {Object.entries(analyticsGroups).map(([groupParent, metrics]) => (
            <optgroup
              key={groupParent}
              label={camelCaseToTitleCase(groupParent)}
            >
              {Object.entries(metrics).map(
                ([groupKey, group]: [string, AnalyticsGroup]) => (
                  <option key={groupKey} value={`${groupParent}.${groupKey}`}>
                    {group.label}
                  </option>
                )
              )}
            </optgroup>
          ))}
        </Select>
      </FormControl>
      <FormControl>
        <Controller
          control={form.control}
          name="includePrevious"
          defaultValue={false}
          render={({ field: { onChange, value } }) => (
            <Switch onChange={onChange} isChecked={value}>
              Include previous period
            </Switch>
          )}
        />
      </FormControl>
    </VStack>
  );
}

function SeriesFieldItem({
  form,
  field,
  index,
  seriesFields,
  setExpandedSeries,
}: {
  form: ReturnType<typeof useForm<CustomGraphFormData>>;
  field: FieldArrayWithId<CustomGraphFormData, "series", "id">;
  index: number;
  seriesFields: UseFieldArrayReturn<CustomGraphFormData, "series", "id">;
  setExpandedSeries: Dispatch<SetStateAction<number | number[]>>;
}) {
  const theme = useTheme();
  const colorSet = form.watch(`series.${index}.colorSet`);
  const coneColors = rotatingColors[colorSet].map((color, i) => {
    const [name, number] = color.color.split(".");
    const color_ = theme.colors[name ?? ""][+(number ?? "")];
    const len = rotatingColors[colorSet].length;

    return `${color_} ${(i / len) * 100}%, ${color_} ${((i + 1) / len) * 100}%`;
  });

  const seriesLength = form.watch(`series`).length;
  const groupBy = form.watch("groupBy");

  useEffect(() => {
    if (seriesLength === 1 && groupBy) {
      form.setValue(
        `series.${index}.colorSet`,
        groupBy.startsWith("sentiment") ? "positiveNegativeNeutral" : "colors"
      );
    }
  }, [form, groupBy, index, seriesLength]);

  return (
    <AccordionItem
      key={field.id}
      border="1px solid"
      borderColor="gray.200"
      marginBottom={4}
    >
      <AccordionButton background="gray.100" fontWeight="bold" paddingLeft={1}>
        <HStack width="full" spacing={4}>
          <HStack spacing={1}>
            <Menu>
              <MenuButton
                as={Button}
                variant="unstyled"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <Center>
                  <Box
                    width="32px"
                    height="32px"
                    borderRadius="100%"
                    background={`conic-gradient(from -${
                      360 / coneColors.length
                    }deg, ${coneColors.join(", ")})`}
                  ></Box>
                </Center>
              </MenuButton>
              <MenuList>
                {Object.entries(rotatingColors).map(([key, colorSet]) => (
                  <MenuItem
                    key={key}
                    onClick={(e) => {
                      e.stopPropagation();
                      form.setValue(
                        `series.${index}.colorSet`,
                        key as RotatingColorSet,
                        { shouldTouch: true }
                      );
                    }}
                  >
                    <VStack align="start" spacing={2}>
                      <Text>{camelCaseToTitleCase(key)}</Text>
                      <HStack spacing={0} paddingLeft="12px">
                        {colorSet.map((color, i) => {
                          return (
                            <Box
                              key={i}
                              width="32px"
                              height="32px"
                              borderRadius="100%"
                              backgroundColor={color.color}
                              marginLeft="-12px"
                            ></Box>
                          );
                        })}
                      </HStack>
                    </VStack>
                  </MenuItem>
                ))}
              </MenuList>
            </Menu>
            <Input
              {...form.control.register(`series.${index}.name`)}
              border="none"
              paddingX={2}
              onClick={(e) => {
                e.stopPropagation();
              }}
              onDoubleClick={() => {
                setExpandedSeries((prev) => {
                  if (Array.isArray(prev)) {
                    return prev.includes(index)
                      ? prev.filter((i) => i !== index)
                      : [...prev, index];
                  }
                  return prev;
                });
              }}
            />
          </HStack>
          <Spacer />
          {seriesFields.fields.length > 1 && (
            <Trash
              role="button"
              onClick={() => seriesFields.remove(index)}
              width={16}
            />
          )}
          <AccordionIcon />
        </HStack>
      </AccordionButton>
      <AccordionPanel>
        <SeriesField form={form} index={index} />
      </AccordionPanel>
    </AccordionItem>
  );
}

function SeriesField({
  form,
  index,
}: {
  form: ReturnType<typeof useForm<CustomGraphFormData>>;
  index: number;
}) {
  const metric = form.watch(`series.${index}.metric`);
  const aggregation = form.watch(`series.${index}.aggregation`);
  const pipelineField = form.watch(`series.${index}.pipeline.field`);
  const pipelineAggregation = form.watch(
    `series.${index}.pipeline.aggregation`
  );

  const metricField = form.control.register(`series.${index}.metric`);

  useEffect(() => {
    const metric_ = metric ? getMetric(metric)?.label ?? metric : undefined;
    const aggregation_ = aggregation
      ? metricAggregations[aggregation] ?? aggregation
      : undefined;
    const pipeline_ = pipelineField
      ? analyticsPipelines[pipelineField]?.label ?? pipelineField
      : undefined;
    const pipelineAggregation_ =
      pipelineField && pipelineAggregation
        ? pipelineAggregations[pipelineAggregation] ?? pipelineAggregation
        : undefined;

    const name = uppercaseFirstLetterLowerCaseRest(
      [pipelineAggregation_, metric_, aggregation_, pipeline_]
        .filter((x) => x)
        .join(" ")
    );

    if (!form.getFieldState(`series.${index}.name`)?.isTouched) {
      form.setValue(`series.${index}.name`, name);
    }
    if (!form.getFieldState(`series.${index}.colorSet`)?.isTouched) {
      form.setValue(`series.${index}.colorSet`, getMetric(metric).colorSet);
    }
  }, [aggregation, form, index, metric, pipelineAggregation, pipelineField]);

  return (
    <VStack align="start" width="full" spacing={4}>
      <FormControl>
        <FormLabel>Metric</FormLabel>
        <HStack width="full">
          <Select
            {...metricField}
            onChange={(e) => {
              const metric_ = getMetric(e.target.value as any);
              if (!metric_.allowedAggregations.includes(aggregation)) {
                form.setValue(
                  `series.${index}.aggregation`,
                  metric_.allowedAggregations[0]!
                );
              }

              void metricField.onChange(e);
            }}
          >
            {Object.entries(analyticsMetrics).map(([group, metrics]) => (
              <optgroup key={group} label={camelCaseToTitleCase(group)}>
                {Object.entries(metrics).map(
                  ([metricKey, metric]: [string, AnalyticsMetric]) => (
                    <option key={metricKey} value={`${group}.${metricKey}`}>
                      {metric.label}
                    </option>
                  )
                )}
              </optgroup>
            ))}
          </Select>
          <Select
            {...form.control.register(`series.${index}.aggregation`)}
            minWidth="fit-content"
          >
            {getMetric(metric).allowedAggregations.map((agg) => (
              <option key={agg} value={agg}>
                {metricAggregations[agg]}
              </option>
            ))}
          </Select>
          <Select
            {...form.control.register(`series.${index}.pipeline.field`)}
            minWidth="fit-content"
          >
            <option value="">all</option>
            {Object.entries(analyticsPipelines)
              .filter(([key, _]) =>
                metric.includes("trace_id") ? key !== "trace_id" : true
              )
              .map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
          </Select>
        </HStack>
      </FormControl>
      {pipelineField && (
        <FormControl>
          <FormLabel>Aggregation</FormLabel>
          <Select
            {...form.control.register(`series.${index}.pipeline.aggregation`)}
            minWidth="fit-content"
          >
            {Object.entries(pipelineAggregations).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </FormControl>
      )}
    </VStack>
  );
}

function GraphTypeField({
  form,
}: {
  form: ReturnType<typeof useForm<CustomGraphFormData>>;
}) {
  return (
    <Controller
      control={form.control}
      name={`graphType`}
      render={({ field }) => (
        <MultiSelect
          {...field}
          options={chartOptions}
          placeholder="Select Graph Type"
          isSearchable={false}
          components={{
            Option: ({ children, ...props }) => (
              <chakraComponents.Option {...props}>
                <HStack spacing={2}>
                  {props.data.icon}
                  <Text>{children}</Text>
                </HStack>
              </chakraComponents.Option>
            ),
            ValueContainer: ({ children, ...props }) => {
              const { getValue } = props;
              const value = getValue();
              const icon = value.length > 0 ? value[0]?.icon : null;

              return (
                <chakraComponents.ValueContainer {...props}>
                  <HStack spacing={2}>
                    {icon}
                    {children}
                  </HStack>
                </chakraComponents.ValueContainer>
              );
            },
          }}
        />
      )}
    />
  );
}