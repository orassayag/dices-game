import { Router } from 'express';
import { createItemSchema, updateItemSchema } from '../../shared';
import * as itemsService from '../services/items.js';
import { AppError } from '../middleware/errorHandler.js';

export const itemsRouter = Router();

itemsRouter.get('/', (_req, res, next) => {
  try {
    res.json(itemsService.getAllItems());
  } catch (err) {
    next(err);
  }
});

itemsRouter.get('/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const item = itemsService.getItemById(id);
    if (!item) throw new AppError(404, 'Item not found');
    res.json(item);
  } catch (err) {
    next(err);
  }
});

itemsRouter.post('/', (req, res, next) => {
  try {
    const input = createItemSchema.parse(req.body);
    res.status(201).json(itemsService.createItem(input));
  } catch (err) {
    next(err);
  }
});

itemsRouter.put('/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const input = updateItemSchema.parse(req.body);
    const item = itemsService.updateItem(id, input);
    if (!item) throw new AppError(404, 'Item not found');
    res.json(item);
  } catch (err) {
    next(err);
  }
});

itemsRouter.delete('/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    itemsService.deleteItem(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
