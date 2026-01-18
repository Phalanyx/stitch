export interface Command {
  id: string;
  description: string;
  timestamp: number;
  type: CommandType;
  execute(): void;
  undo(): void;
}

export type CommandType =
  | 'video:add'
  | 'video:remove'
  | 'video:move'
  | 'video:trim'
  | 'audio:add'
  | 'audio:remove'
  | 'audio:move'
  | 'audio:trim'
  | 'layer:add'
  | 'layer:remove'
  | 'layer:toggleMute'
  | 'layer:rename'
  | 'batch:delete'
  | 'batch:paste';
