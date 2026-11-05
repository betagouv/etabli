'use client';

import { memo, useRef } from 'react';
import { useIsomorphicLayoutEffect } from 'react-use';

import { MapCircle, minimumPieRadius, viewSize } from '@etabli/src/utils/organizations-map';

const canvasDensity = 2; // Stays sharp on high density screens

export const OrganizationsMapCanvas = memo(function OrganizationsMapCanvas(props: { circles: MapCircle[] }) {
  const { circles } = props;

  // There can be more than 10 000 circles at the top level: as DOM elements, going back there freezes the page for seconds
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useIsomorphicLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }

    const draw = () => {
      const styles = getComputedStyle(canvas);
      const colors = new Map<string, string>();
      const getColor = (variable: string) => {
        let color = colors.get(variable);
        if (color === undefined) {
          color = styles.getPropertyValue(variable).trim();
          colors.set(variable, color);
        }

        return color;
      };

      const paint = (
        x: number,
        y: number,
        r: number,
        fill: string,
        fillOpacity: number,
        stroke: string,
        strokeWidth: number,
        slices: MapCircle['slices'] = []
      ) => {
        context.globalAlpha = fillOpacity;
        if (slices.length > 1 && r >= minimumPieRadius) {
          let startAngle = -Math.PI / 2;
          for (const slice of slices) {
            const endAngle = startAngle + slice.share * 2 * Math.PI;

            context.beginPath();
            context.moveTo(x, y);
            context.arc(x, y, r, startAngle, endAngle);
            context.closePath();
            context.fillStyle = getColor(slice.variable);
            context.fill();
            startAngle = endAngle;
          }

          context.beginPath();
          context.arc(x, y, r, 0, 2 * Math.PI);
        } else {
          context.beginPath();
          context.arc(x, y, r, 0, 2 * Math.PI);
          context.fillStyle = getColor(fill);
          context.fill();
        }

        context.globalAlpha = 1;
        context.strokeStyle = getColor(stroke);
        context.lineWidth = strokeWidth;
        context.stroke();
      };

      context.setTransform(canvas.width / viewSize, 0, 0, canvas.height / viewSize, 0, 0);
      context.clearRect(0, 0, viewSize, viewSize);
      paint(viewSize / 2, viewSize / 2, viewSize / 2 - 1, '--background-default-grey', 1, '--border-default-grey', 1);
      for (const circle of circles) {
        paint(circle.x, circle.y, circle.r, circle.fill, circle.fillOpacity, circle.stroke, circle.r < 3 ? 0.5 : 1, circle.slices);
      }
    };

    draw();

    // A canvas does not follow CSS variables by itself when the theme changes
    const themeObserver = new MutationObserver(draw);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-fr-theme'] });

    return () => themeObserver.disconnect();
  }, [circles]);

  return (
    <canvas
      ref={canvasRef}
      width={viewSize * canvasDensity}
      height={viewSize * canvasDensity}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
    />
  );
});
