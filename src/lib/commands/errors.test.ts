/**
 * Tests for command error utilities.
 */

import { CommandExecutionError, assertLayerExists, assertClipExists } from './errors';
import { AudioLayer } from '@/types/audio';

describe('CommandExecutionError', () => {
  it('creates error with message and commandType', () => {
    const error = new CommandExecutionError('Something went wrong', 'audio:add');

    expect(error.message).toBe('Something went wrong');
    expect(error.commandType).toBe('audio:add');
  });

  it('extends Error', () => {
    const error = new CommandExecutionError('Test error', 'video:remove');

    expect(error).toBeInstanceOf(Error);
  });

  it('has correct name property', () => {
    const error = new CommandExecutionError('Test', 'audio:move');

    expect(error.name).toBe('CommandExecutionError');
  });

  it('preserves stack trace', () => {
    const error = new CommandExecutionError('Test', 'batch:delete');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('CommandExecutionError');
  });

  it('commandType is readonly', () => {
    const error = new CommandExecutionError('Test', 'layer:toggleMute');

    // TypeScript would prevent this, but verify runtime behavior
    expect(error.commandType).toBe('layer:toggleMute');
  });
});

describe('assertLayerExists', () => {
  const createLayer = (id: string, name = 'Layer'): AudioLayer => ({
    id,
    name,
    clips: [],
    muted: false,
  });

  it('returns the layer when found', () => {
    const layers = [
      createLayer('layer-1', 'Audio 1'),
      createLayer('layer-2', 'Audio 2'),
    ];

    const result = assertLayerExists(layers, 'layer-2', 'audio:add');

    expect(result).toBe(layers[1]);
    expect(result.id).toBe('layer-2');
  });

  it('throws CommandExecutionError when layer not found', () => {
    const layers = [createLayer('layer-1')];

    expect(() => {
      assertLayerExists(layers, 'non-existent', 'audio:add');
    }).toThrow(CommandExecutionError);
  });

  it('includes layer ID in error message', () => {
    const layers: AudioLayer[] = [];

    try {
      assertLayerExists(layers, 'missing-layer-id', 'audio:remove');
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CommandExecutionError);
      expect((error as CommandExecutionError).message).toContain('missing-layer-id');
    }
  });

  it('includes operation name as commandType', () => {
    const layers: AudioLayer[] = [];

    try {
      assertLayerExists(layers, 'id', 'audio:trim');
      fail('Should have thrown');
    } catch (error) {
      expect((error as CommandExecutionError).commandType).toBe('audio:trim');
    }
  });

  it('works with empty layers array', () => {
    expect(() => {
      assertLayerExists([], 'any-id', 'test');
    }).toThrow(CommandExecutionError);
  });

  it('returns first matching layer if duplicates exist', () => {
    const layers = [
      createLayer('dup-id', 'First'),
      createLayer('dup-id', 'Second'),
    ];

    const result = assertLayerExists(layers, 'dup-id', 'test');

    expect(result.name).toBe('First');
  });
});

describe('assertClipExists', () => {
  const createLayerWithClips = (layerId: string, clipIds: string[]): AudioLayer => ({
    id: layerId,
    name: 'Test Layer',
    clips: clipIds.map((id) => ({
      id,
      audioId: id,
      url: 'https://example.com/audio.mp3',
      timestamp: 0,
      duration: 5,
    })),
    muted: false,
  });

  it('does not throw when clip exists', () => {
    const layer = createLayerWithClips('layer-1', ['clip-a', 'clip-b']);

    expect(() => {
      assertClipExists(layer, 'clip-a', 'audio:move');
    }).not.toThrow();
  });

  it('throws CommandExecutionError when clip not found', () => {
    const layer = createLayerWithClips('layer-1', ['clip-a']);

    expect(() => {
      assertClipExists(layer, 'clip-x', 'audio:remove');
    }).toThrow(CommandExecutionError);
  });

  it('includes clip ID and layer ID in error message', () => {
    const layer = createLayerWithClips('my-layer', []);

    try {
      assertClipExists(layer, 'missing-clip', 'audio:trim');
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CommandExecutionError);
      const message = (error as CommandExecutionError).message;
      expect(message).toContain('missing-clip');
      expect(message).toContain('my-layer');
    }
  });

  it('includes operation name as commandType', () => {
    const layer = createLayerWithClips('layer', []);

    try {
      assertClipExists(layer, 'clip', 'audio:toggleClipMute');
      fail('Should have thrown');
    } catch (error) {
      expect((error as CommandExecutionError).commandType).toBe('audio:toggleClipMute');
    }
  });

  it('works with empty clips array', () => {
    const layer = createLayerWithClips('layer', []);

    expect(() => {
      assertClipExists(layer, 'any-clip', 'test');
    }).toThrow(CommandExecutionError);
  });

  it('finds clip among multiple clips', () => {
    const layer = createLayerWithClips('layer', ['a', 'b', 'c', 'd']);

    expect(() => {
      assertClipExists(layer, 'c', 'test');
    }).not.toThrow();
  });
});
