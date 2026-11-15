// Types for lathe.mjs (verbatim copy of the Anatomy kit, which ships no declarations). Only what this project uses.
import type { Flat, Point3, Projection, SolidPaths } from './iso-kit';

export interface Frame { o: Point3; a: Point3; u: Point3; v: Point3 }
/** `[s, r]` along the axis; a third element marks a smooth knot. */
export type Knot = [number, number] | [number, number, number];
export interface Smooth { slope?: (s: number) => number; radius?: (s: number) => number; rows?: number }
export interface LatheOptions { steps?: number; fill?: 'auto' | 'hull' | 'faces'; bevel?: number; rims?: 'all' | 'none'; smooth?: boolean | 'auto' | Smooth }
export interface Faded { d: string; alpha: number }

export function frameAlong(o: Point3, a: Point3): Frame;
export function frameOf(o: Point3, a: Point3, u: Point3, v: Point3): Frame;
export function pointOf(F: Frame, s: number, r: number, angle: number): Point3;
export function lathe(meridian: Knot[], F: Frame, P: Projection, options?: LatheOptions): SolidPaths;
export function solidOf(profile: Knot[], F: Frame, P: Projection, options?: LatheOptions): SolidPaths;
export function disc(s0: number, s1: number, r: number, F: Frame, P: Projection, options?: LatheOptions): SolidPaths;
export function ringBand(s0: number, s1: number, rIn: number, rOut: number, F: Frame, P: Projection, options?: LatheOptions): SolidPaths;
export function sphereOf(centre: Point3, r: number, P: Projection, options?: { steps?: number }): SolidPaths;
export function arcOf(F: Frame, s: number, r: number, P: Projection, options?: { slope?: number; inward?: boolean; from?: number; to?: number; trim?: number }): string;
export function circleOf(F: Frame, s: number, r: number, P: Projection, steps?: number): string;
export function spokesOf(F: Frame, s: number, r0: number, r1: number, count: number, P: Projection, options?: { phase?: number }): string;
export function ribsOf(F: Frame, s0: number, s1: number, r: number, count: number, P: Projection, options?: { phase?: number; r1?: number; least?: number; seams?: boolean }): string;
export function ribsOf(F: Frame, s0: number, s1: number, r: number, count: number, P: Projection, options: { fade: [number, number]; phase?: number; r1?: number; seams?: boolean }): Faded[];
export function dotsOf(F: Frame, s: number, r: number, count: number, P: Projection, options?: { phase?: number; slope?: number; least?: number; all?: boolean }): Flat[];
