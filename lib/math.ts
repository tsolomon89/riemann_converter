/**
 * DEPRECATED: ZERO CLIENT-SIDE MATH POLICY
 * 
 * All mathematical operations must be performed by the Python Compute Engine (experiment_engine.py).
 * The frontend is a dumb oscilloscope.
 * 
 * This file is kept as a placeholder to prevent build errors if referenced by legacy tests,
 * but functions will throw errors if used in production.
 */

export function ExplicitPsi(x: number, gammas: number[]): number {
    void x;
    void gammas;
    throw new Error("Client-side math is forbidden. Use experiment_engine.py.");
}

export function ExplicitPi(x: number, gammas: number[]): number {
    void x;
    void gammas;
    throw new Error("Client-side math is forbidden. Use experiment_engine.py.");
}

export function SchoenfeldBound(x: number): number {
    void x;
    throw new Error("Client-side math is forbidden. Use experiment_engine.py.");
}
