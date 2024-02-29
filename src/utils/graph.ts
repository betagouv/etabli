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
        if (pathNodes.includes(successor)) {
          // We avoid looping to a previous node
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
