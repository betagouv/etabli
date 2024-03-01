import assert from 'assert';
import { Graph } from 'graphlib';

// There was the Dijkstra algorithm with the library with use (https://github.com/dagrejs/graphlib/blob/master/lib/alg/dijkstra.js)
// but it does each distance for each node in the graph even if not connected (dealing with Infinity value)...
// Since we have thousands of nodes just this step takes a bit of time so prefering having something that limits arrays manipulations
export function getClosestSinkNode(g: Graph, source: string): string {
  let closestSinkNode: string | null = null;
  let closestSinkNodeDistance: number = Infinity;

  const handleEndingNode = (nodeId: string, distanceFromStart: number) => {
    // For the current exploration there is no more path, save it if it's the shortest one
    if (distanceFromStart < closestSinkNodeDistance) {
      closestSinkNode = nodeId;
      closestSinkNodeDistance = distanceFromStart;
    }
  };

  const explore = (nodeId: string, previousNodes: string[], distanceFromStart: number) => {
    const successors = g.successors(nodeId);

    const pathNodes = [...previousNodes, nodeId];

    if (successors && successors?.length > 0) {
      for (const successor of successors) {
        const existingSuccessorInThePathIndex = pathNodes.findIndex((nodeId) => nodeId === successor);
        if (existingSuccessorInThePathIndex !== -1) {
          // Due to our different maching strategies it's possible with have loops into our graph (see an example at `src/assets/docs/graph_loop.png`)
          // We cannot just skip it because some source would have no closest sink, so we made the choice of taking the ending node
          // the first one by ordering the looping nodes by their name. Like that it guarantees no matter where you start, inside/outside the loop, at which node inside the loop... you will always have the same answer
          const loopingNodes = pathNodes.slice(existingSuccessorInThePathIndex);
          const orderedLoopingNodes = loopingNodes.sort();
          const chosenEndingNode = orderedLoopingNodes[0];

          // We use the distance from the current node of nested calls (whereas the `chosenEndingNode` may be another one)
          // Maybe we should "get back on track" to subtract the distance from the current node to `chosenEndingNode` so the distance passed to `handleEndingNode` would make more sense
          // But for now after some tests it seems to work without it with the loops we have... so leaving it like that (if it becomes needed, use a `pathEdgesDistances` like we do for `pathNodes` and its recursive logic)
          handleEndingNode(chosenEndingNode, distanceFromStart);

          continue;
        }

        const edgeDistance = g.edge(nodeId, successor) as number;
        const traveledDistance = distanceFromStart + edgeDistance;

        explore(successor, pathNodes, traveledDistance);
      }
    } else {
      handleEndingNode(nodeId, distanceFromStart);
    }
  };

  explore(source, [], 0);

  // If it's already a sink node (no successor), it would be in all cases listed
  assert(closestSinkNode);

  return closestSinkNode;
}
