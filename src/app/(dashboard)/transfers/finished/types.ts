export type ShelfLot = { id: string; code: string; quantity: number; stageCode: string; plantType: { id: string; code: string; name: string } };
export type ScannedShelf = { id: string; code: string; name: string; roomId: string; lots: ShelfLot[] };
export type CreatedTransfer = { id: string; code: string; transferredAt: string; shelves: ScannedShelf[] };
