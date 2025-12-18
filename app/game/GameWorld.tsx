'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { Sprite } from './Sprite';
import { getAllNPCs, type NPC } from './npcs';
import { getGameMap, isWalkable, MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, type MapTile } from './map';
import './styles.css';

type Direction = 'up' | 'down' | 'left' | 'right';

type Position = {
  x: number;
  y: number;
};

type GameWorldProps = {
  onNpcInteract: (npc: NPC) => void;
  selectedNpcId: string | null;
  isConnected: boolean;
};

export const GameWorld = ({ onNpcInteract, selectedNpcId, isConnected }: GameWorldProps) => {
  const [playerPos, setPlayerPos] = useState<Position>({ x: 7, y: 5 });
  const [playerDirection, setPlayerDirection] = useState<Direction>('down');
  const [isWalking, setIsWalking] = useState(false);
  const [gameMap] = useState<MapTile[][]>(getGameMap);
  const [npcs] = useState<NPC[]>(getAllNPCs);
  const walkingTimeout = useRef<NodeJS.Timeout | null>(null);

  const getNpcAtPosition = useCallback((x: number, y: number): NPC | undefined => {
    return npcs.find(npc => npc.position.x === x && npc.position.y === y);
  }, [npcs]);

  const getNearbyNpc = useCallback((): NPC | undefined => {
    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
    ];
    for (const { dx, dy } of directions) {
      const npc = getNpcAtPosition(playerPos.x + dx, playerPos.y + dy);
      if (npc) return npc;
    }
    return undefined;
  }, [playerPos, getNpcAtPosition]);

  const nearbyNpc = getNearbyNpc();

  const movePlayer = useCallback((dx: number, dy: number, direction: Direction) => {
    setPlayerDirection(direction);

    const newX = playerPos.x + dx;
    const newY = playerPos.y + dy;

    const npcBlocking = getNpcAtPosition(newX, newY);
    if (npcBlocking || !isWalkable(gameMap, newX, newY)) {
      return;
    }

    setIsWalking(true);
    setPlayerPos({ x: newX, y: newY });

    if (walkingTimeout.current) {
      clearTimeout(walkingTimeout.current);
    }
    walkingTimeout.current = setTimeout(() => {
      setIsWalking(false);
    }, 150);
  }, [playerPos, gameMap, getNpcAtPosition]);

  const handleInteract = useCallback(() => {
    if (nearbyNpc && !isConnected) {
      onNpcInteract(nearbyNpc);
    }
  }, [nearbyNpc, onNpcInteract, isConnected]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          movePlayer(0, -1, 'up');
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          movePlayer(0, 1, 'down');
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          movePlayer(-1, 0, 'left');
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          movePlayer(1, 0, 'right');
          break;
        case ' ':
        case 'Enter':
          e.preventDefault();
          handleInteract();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [movePlayer, handleInteract]);

  return (
    <div className="game-container">
      <div
        className="game-world"
        style={{
          width: MAP_WIDTH * TILE_SIZE,
          height: MAP_HEIGHT * TILE_SIZE,
        }}
      >
        {/* Render tiles */}
        {gameMap.map((row, y) =>
          row.map((tile, x) => (
            <div
              key={`${x}-${y}`}
              className={`tile tile-${tile.type}`}
              style={{
                left: x * TILE_SIZE,
                top: y * TILE_SIZE,
              }}
            />
          ))
        )}

        {/* Render NPCs */}
        {npcs.map((npc) => (
          <Sprite
            key={npc.id}
            type={npc.sprite}
            x={npc.position.x}
            y={npc.position.y}
            name={npc.name}
            isSelected={selectedNpcId === npc.id}
            showHint={nearbyNpc?.id === npc.id && !isConnected}
            onClick={() => {
              if (!isConnected) {
                onNpcInteract(npc);
              }
            }}
          />
        ))}

        {/* Render player */}
        <Sprite
          type="player"
          x={playerPos.x}
          y={playerPos.y}
          direction={playerDirection}
          isWalking={isWalking}
        />
      </div>

      {/* Controls hint */}
      <div className="controls-hint mt-4 text-neutral-400">
        <kbd>WASD</kbd> or <kbd>Arrow Keys</kbd> to move
        {nearbyNpc && !isConnected && (
          <span className="ml-4">
            <kbd>SPACE</kbd> to talk to <span className="text-emerald-400">{nearbyNpc.name}</span>
          </span>
        )}
      </div>
    </div>
  );
};
