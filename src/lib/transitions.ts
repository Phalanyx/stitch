import { Transition, EasingType } from '@/types/transition';

export function getEasing(t: number, type: EasingType = 'linear'): number {
  switch (type) {
    case 'linear': return t;
    case 'easeIn': return t * t;
    case 'easeOut': return t * (2 - t);
    case 'easeInOut': return t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    default: return t;
  }
}

export function renderTransitionFrame(
  transition: Transition,
  progress: number,
  frameA: CanvasImageSource | null,
  frameB: CanvasImageSource | null,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  const t = getEasing(Math.max(0, Math.min(1, progress)), transition.easing);
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  // Helper to draw
  const draw = (img: CanvasImageSource | null, opacity = 1) => {
    if (!img) {
      // If no image, we assume it's part of a fade to/from black/color
      // but if we are just drawing "nothing", we do nothing.
      // The background should be handled by the specific transition logic.
      return;
    }
    ctx.globalAlpha = opacity;
    ctx.drawImage(img, 0, 0, width, height);
  };
  
  const drawColor = (color: string, opacity: number) => {
    ctx.fillStyle = color;
    ctx.globalAlpha = opacity;
    ctx.fillRect(0, 0, width, height);
  }

  switch (transition.type) {
    case 'cut':
      if (t < 0.5) draw(frameA);
      else draw(frameB);
      break;
      
    case 'crossDissolve':
      draw(frameA, 1);
      // Draw B over A with opacity t
      draw(frameB, t);
      break;
      
    case 'fadeToBlack':
      draw(frameA, 1);
      drawColor(transition.color || '#000000', t);
      break;

    case 'fadeFromBlack':
      drawColor(transition.color || '#000000', 1);
      draw(frameB, t);
      break;

    case 'wipe':
      draw(frameA, 1);
      
      ctx.save();
      ctx.beginPath();
      
      const dir = transition.direction || 'left';
      // "Softness" would require a gradient mask, which is complex for basic 2D context clipping.
      // We'll stick to hard wipe for now unless we implement gradient masking.
      
      if (dir === 'right') { // Left to Right (reveals B)
        ctx.rect(0, 0, width * t, height);
      } else if (dir === 'left') { // Right to Left
        ctx.rect(width * (1-t), 0, width * t, height);
      } else if (dir === 'down') { // Top to Bottom
        ctx.rect(0, 0, width, height * t);
      } else if (dir === 'up') { // Bottom to Top
        ctx.rect(0, height * (1-t), width, height * t);
      }
      
      ctx.clip();
      draw(frameB, 1);
      ctx.restore();
      break;
      
    case 'push':
      // A moves out, B moves in.
      // direction 'left' means pushing TO the left (content moves left)
      // so B comes from Right.
      let xA = 0, yA = 0, xB = 0, yB = 0;
      const pushDir = transition.direction || 'left';
      
      if (pushDir === 'left') {
        xA = -width * t;
        xB = width * (1 - t);
      } else if (pushDir === 'right') {
        xA = width * t;
        xB = -width * (1 - t);
      } else if (pushDir === 'up') {
        yA = -height * t;
        yB = height * (1 - t);
      } else if (pushDir === 'down') {
        yA = height * t;
        yB = -height * (1 - t);
      }
      
      ctx.save();
      ctx.translate(xA, yA);
      draw(frameA, 1);
      ctx.restore();
      
      ctx.save();
      ctx.translate(xB, yB);
      draw(frameB, 1);
      ctx.restore();
      break;

    case 'slide':
      // A stays, B slides over.
      draw(frameA, 1);
      
      let xS = 0, yS = 0;
      const slideDir = transition.direction || 'left';
      
      if (slideDir === 'left') { // B slides in from right (moving left)
        xS = width * (1 - t);
      } else if (slideDir === 'right') { // B slides in from left (moving right)
        xS = -width * (1 - t);
      } else if (slideDir === 'up') { // B slides in from bottom
        yS = height * (1 - t);
      } else if (slideDir === 'down') { // B slides in from top
        yS = -height * (1 - t);
      }
      
      ctx.save();
      ctx.translate(xS, yS);
      draw(frameB, 1);
      ctx.restore();
      break;
  }
  
  ctx.globalAlpha = 1;
}
