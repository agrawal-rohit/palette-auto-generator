import React, { useEffect, useMemo, useState } from "react";
import { FaPlay, FaStop } from "react-icons/fa";
import { TinyColor } from "@ctrl/tinycolor";
import {
  Button,
  Flex,
  Heading,
  Icon,
  Stack,
  HStack,
  Text,
  Divider,
  Box,
  Input,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Center,
  InputRightAddon,
  InputGroup,
  useToken,
} from "@chakra-ui/react";
import InfoTooltip from "../components/info-tooltip";
import ColorInput from "../components/color-input";
import ColorSwatch from "../components/color-swatch";
import DesignOne from "../designs/1/design-1";
import DesignTwo from "../designs/2/design-2";
import DesignThree from "../designs/3/design-3";
import ReactECharts from "echarts-for-react";
import { evaluateSolution, seedInitialSolution, sleep } from "../utils";
import { motion } from "framer-motion";
import { FadeInUp } from "../animations/animations";

const MotionCenter = motion(Center);
const MotionBox = motion(Box);

const SimulatedAnnealing: React.FC = () => {
  const [patience, setPatience] = useState(50);
  const [decayRate, setDecayRate] = useState(90);
  const [maxIterations, setMaxIterations] = useState(1000);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [currentTemperature, setCurrentTemperature] = useState(1);
  const [localPatience, setLocalPatience] = useState(0);
  const [metrics, setMetrics] = useState<
    { iteration: number; fitness: number; temperature: number }[]
  >([]);
  const [primaryColor, setPrimaryColor] = useState(
    new TinyColor({
      r: Math.floor(Math.random() * 256),
      g: Math.floor(Math.random() * 256),
      b: Math.floor(Math.random() * 256),
    })
      .toHexString()
      .substring(1)
  );
  const [isSimulationRunning, setIsSimulationRunning] = useState(false);
  const [hasSimulationRunBefore, setHasSimulationRunBefore] = useState(false);
  const [solution, setSolution] = useState(seedInitialSolution());
  const primaryColorTinyColor = new TinyColor(`#${primaryColor}`);
  const primaryColorRGB = [
    primaryColorTinyColor.r,
    primaryColorTinyColor.g,
    primaryColorTinyColor.b,
  ];
  const [primary500, primary100, secondary500, secondary100] = useToken(
    "colors",
    ["primary.500", "primary.100", "secondary.500", "secondary.100"]
  );
  const areInputsInvalid = useMemo(() => {
    return (
      !primaryColorTinyColor.isValid ||
      !(patience >= 0) ||
      !(decayRate >= 0 && decayRate <= 100) ||
      !(maxIterations > 0)
    );
  }, [decayRate, maxIterations, patience, primaryColorTinyColor.isValid]);

  const fitnessGraphOptions = useMemo(() => {
    return {
      title: {
        text: "Solution Fitness Over Time",
        left: "center",
        textStyle: {
          fontSize: 16,
          fontFamily: "Inter",
          fontWeight: "bolder",
        },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "cross",
          label: {
            backgroundColor: "#6a7985",
          },
        },
      },
      toolbox: {
        feature: {
          saveAsImage: {},
        },
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "3%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: metrics.map((val) => `Iteration ${val.iteration}`),
      },
      yAxis: {
        type: "value",
        axisLabel: {
          formatter: "{value}",
        },
      },
      series: [
        {
          name: "Fitness",
          type: "line",
          color: primary500,
          areaStyle: {
            color: primary100,
          },
          emphasis: {
            areaStyle: {
              color: primary100,
            },
          },
          data: metrics.map((val) => val.fitness),
        },
      ],
      animation: false,
    };
  }, [metrics, primary100, primary500]);

  const temperatureGraphOptions = useMemo(() => {
    return {
      title: {
        text: "Temperature Over Time",
        top: 10,
        left: "center",
        textStyle: {
          fontSize: 16,
          fontFamily: "Inter",
          fontWeight: "bolder",
        },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "cross",
          label: {
            backgroundColor: "#6a7985",
          },
        },
      },
      toolbox: {
        feature: {
          saveAsImage: {},
        },
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "3%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: metrics.map((val) => `Iteration ${val.iteration}`),
      },
      yAxis: {
        type: "value",
        axisLabel: {
          formatter: "{value}",
        },
      },
      series: [
        {
          name: "Temperature",
          type: "line",
          color: secondary500,
          areaStyle: {
            color: secondary100,
          },
          emphasis: {
            areaStyle: {
              color: secondary100,
            },
          },
          data: metrics.map((val) => val.temperature),
        },
      ],
      animation: false,
    };
  }, [metrics, secondary100, secondary500]);

  /**
   * Computes the closest neighbour palettes based on the current solution
   *
   * @returns {Array<{idx: number, change: number}>} - Changes to the solution to compute the neighbour
   */
  const computeNeighbours = (): Array<{ idx: number; change: number }> => {
    const neighbours: Array<{ idx: number; change: number }> = [];
    for (let i = 0; i < solution.length; i++) {
      if (solution[i] < 60) {
        neighbours.push({ idx: i, change: 10 });
      } else if (solution[i] > 245) {
        neighbours.push({ idx: i, change: -10 });
      } else {
        neighbours.push({ idx: i, change: 10 });
        neighbours.push({ idx: i, change: -10 });
      }
    }
    return neighbours;
  };

  /**
   * Computes the neighbour solution with the highest fitness value
   *
   * @param {number} currentEval - Fitness value of the current solution
   * @returns {{idx: number, change: number} | null} - Optimal neighbour or null if none is better
   */
  const computeMove = (
    currentEval: number
  ): { idx: number; change: number } | null => {
    let neighbourEvals: Array<number> = [];
    let neighbours = computeNeighbours();
    for (let neighbour of neighbours) {
      let neighbourSolution = [...solution];
      neighbourSolution[neighbour.idx] += neighbour.change;
      let evalMetric = evaluateSolution(primaryColorRGB, neighbourSolution);
      neighbourEvals.push(evalMetric);
    }

    if (currentTemperature <= 0.001) {
      let bestEval = Math.max(...neighbourEvals);
      if (bestEval > currentEval) {
        let maxIdx = neighbourEvals.indexOf(bestEval);
        let bestNeighbour = neighbours[maxIdx];
        return bestNeighbour;
      } else {
        return null;
      }
    } else {
      let randomNeighbourIdx = Math.floor(Math.random() * neighbours.length);
      let randomNeighbourEval = neighbourEvals[randomNeighbourIdx];
      let chosenNeighbour = null;
      if (randomNeighbourEval >= currentEval) {
        chosenNeighbour = neighbours[randomNeighbourIdx];
      } else {
        let acceptProb = Math.exp(
          (-1 * Math.abs(randomNeighbourEval - currentEval)) /
            currentTemperature
        );
        if (Math.random() <= acceptProb) {
          chosenNeighbour = neighbours[randomNeighbourIdx];
        }
      }

      return chosenNeighbour;
    }
  };

  const runSimulation = () => {
    setSolution(seedInitialSolution());
    setIsSimulationRunning(true);
    setHasSimulationRunBefore(true);
    setCurrentIteration(0);
    setCurrentTemperature(1);
    setLocalPatience(0);
    setMetrics([]);
  };

  const stopSimulation = () => {
    setIsSimulationRunning(false);
  };

  useEffect(() => {
    if (currentIteration >= maxIterations) setIsSimulationRunning(false);
    if (!isSimulationRunning) return;

    const executeIteration = async () => {
      const evalMetric = evaluateSolution(primaryColorRGB, solution);
      const bestNeighbour = computeMove(evalMetric);

      let newTemperature = currentTemperature;
      if (currentTemperature >= 0.001) {
        newTemperature = currentTemperature * (decayRate / 100);
        setCurrentTemperature(newTemperature);
      }

      setMetrics((prevMetrics) => [
        ...prevMetrics,
        {
          fitness: evalMetric,
          temperature: newTemperature,
          iteration: currentIteration,
        },
      ]);

      if (bestNeighbour === null) {
        if (localPatience === patience) {
          setIsSimulationRunning(false);
          return;
        }
        setLocalPatience((prev) => prev + 1);
      } else {
        setLocalPatience(0);
        let updatedSolution = [...solution];
        updatedSolution[bestNeighbour.idx] += bestNeighbour.change;
        setSolution(updatedSolution);
      }
      await sleep(50);
      setCurrentIteration((i) => i + 1); // Trigger next iteration
    };

    executeIteration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSimulationRunning, currentIteration]); // Dependencies array

  return (
    <Stack spacing="4">
      <Flex alignItems="center" justifyContent="space-between">
        <HStack spacing="3">
          <Heading fontWeight="semibold">Simulated Annealing Algorithm</Heading>
          <InfoTooltip
            boxSize="4"
            helperText="Simulated Annealing is a probabilistic technique used for finding an approximate solution to an optimization problem. In this context, it is used to generate a color palette that complements a primary color."
          />
        </HStack>
        <Button
          minW="max-content"
          isDisabled={areInputsInvalid}
          colorScheme={isSimulationRunning ? "danger" : "primary"}
          leftIcon={
            <Icon as={isSimulationRunning ? FaStop : FaPlay} boxSize="2.5" />
          }
          onClick={isSimulationRunning ? stopSimulation : runSimulation}
        >
          {isSimulationRunning
            ? "Stop"
            : hasSimulationRunBefore
            ? "Run again"
            : "Run"}
        </Button>
      </Flex>

      <HStack alignItems="flex-start" spacing="10">
        <Box>
          <HStack mb="2" alignItems="center">
            <Text fontSize="sm" fontWeight="medium">
              Primary color
            </Text>
            <InfoTooltip helperText="This is the primary color that will serve as the base for generating the rest of the color palette. The algorithm will create colors that complement this primary color." />
          </HStack>

          <ColorInput
            size="sm"
            value={primaryColor}
            isInvalid={!primaryColorTinyColor.isValid}
            onChange={(e) => setPrimaryColor(e.target.value)}
          />

          {!primaryColorTinyColor.isValid && (
            <Text mt="2" fontSize="xs" lineHeight="4" color="danger.500">
              The primary color must be a valid hex value
            </Text>
          )}
        </Box>

        <Box>
          <HStack mb="2" alignItems="center">
            <Text fontSize="sm" fontWeight="medium">
              Patience
            </Text>
            <InfoTooltip helperText="The 'Patience' parameter refers to the number of time steps the algorithm will wait before stopping the simulation once it has detected that the solution has locally converged. This means that the algorithm has found a solution where any small changes do not significantly improve the outcome. Increasing this value will make the algorithm run longer but may not necessarily improve the final solution." />
          </HStack>

          <Input
            w="24"
            min="0"
            size="sm"
            type="number"
            value={patience}
            isInvalid={!(patience >= 0)}
            onChange={(e) => setPatience(parseInt(e.target.value))}
          />

          {!(patience >= 0) && (
            <Text mt="2" fontSize="xs" lineHeight="4" color="danger.500">
              The patience must be a non-negative number
            </Text>
          )}
        </Box>

        <Box>
          <HStack mb="2" alignItems="center">
            <Text fontSize="sm" fontWeight="medium">
              Temperature Decay Rate
            </Text>
            <InfoTooltip helperText="The 'Temperature Decay Rate' parameter controls the rate at which the temperature decreases during the simulated annealing process. A higher decay rate means the temperature drops faster, leading to a quicker convergence but potentially missing the global optimum. A lower decay rate allows for a more thorough exploration of the solution space, increasing the chances of finding the global optimum but requiring more computation time." />
          </HStack>

          <InputGroup size="sm">
            <Input
              min="0"
              max="100"
              type="number"
              value={decayRate}
              isInvalid={!(decayRate >= 0 && decayRate <= 100)}
              onChange={(e) => setDecayRate(parseInt(e.target.value))}
            />
            <InputRightAddon>%</InputRightAddon>
          </InputGroup>

          {!(decayRate >= 0 && decayRate <= 100) && (
            <Text mt="2" fontSize="xs" lineHeight="4" color="danger.500">
              The decay rate must be a percentage value
            </Text>
          )}
        </Box>

        <Box>
          <HStack mb="2" alignItems="center">
            <Text fontSize="sm" fontWeight="medium">
              Iterations
            </Text>
            <InfoTooltip helperText="The 'Iterations' parameter refers to the maximum number of iterations the algorithm will perform. If the solution does not converge before reaching this limit, the algorithm will stop and return the best solution found so far. Increasing this value will allow the algorithm more time to find a better solution, but will also increase the computation time." />
          </HStack>

          <Input
            w="20"
            min="1"
            size="sm"
            type="number"
            value={maxIterations}
            isInvalid={!(maxIterations > 0)}
            onChange={(e) => setMaxIterations(parseInt(e.target.value))}
          />

          {!(maxIterations > 0) && (
            <Text mt="2" fontSize="xs" lineHeight="4" color="danger.500">
              The iterations must be a positive number
            </Text>
          )}
        </Box>
      </HStack>

      <Divider my="3" />

      {!hasSimulationRunBefore ? null : (
        <Flex alignItems="flex-start">
          <Flex flex={1}>
            <Stack spacing="16">
              <MotionCenter
                variants={FadeInUp}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <HStack spacing="4">
                  <ColorSwatch value={primaryColorRGB} label="Primary" />
                  <ColorSwatch value={solution.slice(0, 3)} label="Accent" />
                  <ColorSwatch
                    value={solution.slice(3, 6)}
                    label="Background"
                  />
                  <ColorSwatch value={solution.slice(6, 9)} label="Surface" />
                  <ColorSwatch
                    value={solution.slice(9, 12)}
                    label="Button Text"
                  />
                  <ColorSwatch
                    value={solution.slice(12, 15)}
                    label="Main text"
                  />
                </HStack>
              </MotionCenter>

              <Stack>
                <MotionBox
                  variants={FadeInUp}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <ReactECharts
                    option={fitnessGraphOptions}
                    style={{ height: "200px" }}
                  />
                </MotionBox>

                <MotionBox
                  variants={FadeInUp}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <ReactECharts
                    option={temperatureGraphOptions}
                    style={{ height: "150px" }}
                  />
                </MotionBox>
              </Stack>
            </Stack>
          </Flex>

          <Flex justifyContent="flex-end" flex={1}>
            <Tabs size="sm" align="end" variant="soft-rounded">
              <TabList>
                <Tab fontWeight="medium">Preview 1</Tab>
                <Tab fontWeight="medium">Preview 2</Tab>
                <Tab fontWeight="medium">Preview 3</Tab>
              </TabList>

              <TabPanels>
                <TabPanel pr="0" justifyContent="flex-end">
                  <MotionCenter
                    variants={FadeInUp}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <DesignOne palette={[...primaryColorRGB, ...solution]} />
                  </MotionCenter>
                </TabPanel>
                <TabPanel pr="0" justifyContent="flex-end">
                  <MotionCenter
                    variants={FadeInUp}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <DesignTwo palette={[...primaryColorRGB, ...solution]} />
                  </MotionCenter>
                </TabPanel>
                <TabPanel pr="0" justifyContent="flex-end">
                  <MotionCenter
                    variants={FadeInUp}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <DesignThree palette={[...primaryColorRGB, ...solution]} />
                  </MotionCenter>
                </TabPanel>
              </TabPanels>
            </Tabs>
          </Flex>
        </Flex>
      )}
    </Stack>
  );
};

export default SimulatedAnnealing;
