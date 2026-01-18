export type TransitionType = 
  | 'cut'
  | 'crossDissolve'
  | 'fadeToBlack'
  | 'fadeFromBlack'
  | 'wipe'
  | 'push'
  | 'slide';

export type TransitionDirection = 'left' | 'right' | 'up' | 'down';
export type EasingType = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

export interface Transition {
  id: string;
  type: TransitionType;
  
  // The clips involved. 
  // For standard transitions (dissolve, wipe, push, slide), both should be present.
  // For fadeToBlack, prevClipId is required.
  // For fadeFromBlack, nextClipId is required.
  prevClipId?: string;
  nextClipId?: string;
  
  duration: number; // in milliseconds
  
  // Optional parameters based on type
  color?: string; // defaults to black
  direction?: TransitionDirection; // defaults to left
  softness?: number; // 0-1? or pixel value? Assuming 0-1 or similar relative value for now.
  easing?: EasingType;
}
