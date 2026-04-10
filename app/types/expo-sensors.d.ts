declare module 'expo-sensors' {
  export type MagnetometerMeasurement = { x: number; y: number; z: number };
  export type AccelerometerMeasurement = { x: number; y: number; z: number };
  export type Subscription = { remove(): void };
  export const Magnetometer: {
    addListener(listener: (data: MagnetometerMeasurement) => void): Subscription;
    setUpdateInterval(ms: number): void;
  };
  export const Accelerometer: {
    addListener(listener: (data: AccelerometerMeasurement) => void): Subscription;
    setUpdateInterval(ms: number): void;
  };
}

