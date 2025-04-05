import { ElementId, IdList } from "articulated";

export function deleteRange(
  idList: IdList,
  startId: ElementId,
  endId?: ElementId
): IdList {
  if (endId === undefined) return idList.delete(startId);

  // We only need to delete the present ids, so querying _idList instead of
  // _idList.knownIds is okay here.
  const startIndex = idList.indexOf(startId, "right");
  const endIndex = idList.indexOf(endId, "left");
  const allIds: ElementId[] = [];
  for (let i = startIndex; i <= endIndex; i++) {
    allIds.push(idList.at(i));
  }

  for (const id of allIds) idList = idList.delete(id);
  return idList;
}
