/**
 * Validation Middleware
 */

import config from '../config/index.js';
import { AppError } from './errorHandler.js';

export function validatePixel(req, res, next) {
  const { x, y, color } = req.body;
  
  if (x === undefined || y === undefined || !color) throw new AppError('Missing x, y, or color', 400, 'VALIDATION_ERROR');
  
  const xNum = parseInt(x, 10), yNum = parseInt(y, 10);
  if (isNaN(xNum) || isNaN(yNum)) throw new AppError('Invalid coordinates', 400, 'INVALID_COORDINATES');
  if (xNum < 0 || xNum >= config.canvas.width || yNum < 0 || yNum >= config.canvas.height) {
    throw new AppError(`Out of bounds (0-${config.canvas.width - 1}, 0-${config.canvas.height - 1})`, 400, 'OUT_OF_BOUNDS');
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) throw new AppError('Invalid color format (#RRGGBB)', 400, 'INVALID_COLOR');
  
  const normalized = color.toLowerCase();
  if (!config.canvas.palette.includes(normalized)) throw new AppError('Color not in palette', 400, 'COLOR_NOT_IN_PALETTE');
  
  req.body.x = xNum;
  req.body.y = yNum;
  req.body.color = normalized;
  next();
}

export function validateCanvasImport(req, res, next) {
  const { pixels } = req.body;
  if (!pixels || !Array.isArray(pixels)) throw new AppError('pixels array required', 400, 'VALIDATION_ERROR');
  
  for (const { x, y, color } of pixels) {
    if (x === undefined || y === undefined || !color) throw new AppError('Invalid pixel data', 400, 'INVALID_PIXEL_DATA');
    const xNum = parseInt(x, 10), yNum = parseInt(y, 10);
    if (isNaN(xNum) || isNaN(yNum)) throw new AppError(`Invalid coords: ${x}, ${y}`, 400, 'INVALID_COORDINATES');
    if (xNum < 0 || xNum >= config.canvas.width || yNum < 0 || yNum >= config.canvas.height) throw new AppError(`Out of bounds: ${xNum}, ${yNum}`, 400, 'OUT_OF_BOUNDS');
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) throw new AppError(`Invalid color: ${color}`, 400, 'INVALID_COLOR');
  }
  next();
}
