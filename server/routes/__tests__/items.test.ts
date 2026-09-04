// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import db from '../../db.js';

const app = createApp();

beforeEach(() => {
  db.exec('DELETE FROM items');
});

describe('GET /api/items', () => {
  it('should return an empty array when there are no items', async () => {
    const res = await request(app).get('/api/items');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('should return all items', async () => {
    db.prepare('INSERT INTO items (name) VALUES (?)').run('Test item');
    const res = await request(app).get('/api/items');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Test item');
  });
});

describe('GET /api/items/:id', () => {
  it('should return the item when it exists', async () => {
    const created = await request(app).post('/api/items').send({ name: 'Findable item' });
    const res = await request(app).get(`/api/items/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Findable item');
  });

  it('should return 404 when the item does not exist', async () => {
    const res = await request(app).get('/api/items/9999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Item not found');
  });
});

describe('POST /api/items', () => {
  it('should create an item and return 201 with the new item', async () => {
    const res = await request(app).post('/api/items').send({ name: 'New item' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('New item');
    expect(res.body.id).toBeDefined();
  });

  it('should return 400 for invalid input', async () => {
    const res = await request(app).post('/api/items').send({ name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('should return 400 when body is missing name', async () => {
    const res = await request(app).post('/api/items').send({});
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/items/:id', () => {
  it('should update only the provided fields and return the updated item', async () => {
    const created = await request(app)
      .post('/api/items')
      .send({ name: 'Old name', description: 'Keep me' });
    const res = await request(app).put(`/api/items/${created.body.id}`).send({ name: 'New name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New name');
    expect(res.body.description).toBe('Keep me');
  });

  it('should return 404 when the item does not exist', async () => {
    const res = await request(app).put('/api/items/9999').send({ name: 'Nobody home' });
    expect(res.status).toBe(404);
  });

  it('should return 400 for invalid input', async () => {
    const created = await request(app).post('/api/items').send({ name: 'Valid item' });
    const res = await request(app).put(`/api/items/${created.body.id}`).send({ name: '' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/items/:id', () => {
  it('should delete the item and return 204', async () => {
    const created = await request(app).post('/api/items').send({ name: 'Doomed item' });
    const res = await request(app).delete(`/api/items/${created.body.id}`);
    expect(res.status).toBe(204);

    const check = await request(app).get(`/api/items/${created.body.id}`);
    expect(check.status).toBe(404);
  });
});
