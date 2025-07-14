declare module 'pick-distinct-colors' {
  export function pickDistinctColors(args: {
    count: number;
    algorithm?: string;
    poolSize?: number;
    colors?: number[][];
    seed?: number;
  }): Promise<{
    colors: number[][];
    time: number;
  }>;

  export function maxSumDistancesSequential(
    colors: number[][],
    selectCount: number
  ): {
    colors: number[][];
    time: number;
  };
}