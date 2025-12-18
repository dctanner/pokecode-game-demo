'use client';

import { type NPC } from './npcs';

type Direction = 'up' | 'down' | 'left' | 'right';

type SpriteProps = {
  type: 'player' | NPC['sprite'];
  x: number;
  y: number;
  direction?: Direction;
  isWalking?: boolean;
  isSelected?: boolean;
  name?: string;
  showHint?: boolean;
  onClick?: () => void;
};

export const Sprite = ({
  type,
  x,
  y,
  direction = 'down',
  isWalking = false,
  isSelected = false,
  name,
  showHint = false,
  onClick
}: SpriteProps) => {
  const tileSize = 32;
  const isLeft = direction === 'left';

  return (
    <div
      className={`sprite sprite-${type} ${isWalking ? 'sprite-walking' : ''} ${isSelected ? 'npc-selected' : ''} ${isLeft ? 'sprite-left' : ''}`}
      style={{
        left: x * tileSize,
        top: y * tileSize,
        cursor: onClick ? 'pointer' : 'default'
      }}
      onClick={onClick}
    >
      <div className="sprite-head">
        <div className="sprite-eyes" />
      </div>
      <div className="sprite-body" />
      <div className="sprite-feet" />
      {showHint && (
        <div className="interaction-hint">Press SPACE</div>
      )}
      {name && (
        <div className="npc-nametag">{name}</div>
      )}
    </div>
  );
};
