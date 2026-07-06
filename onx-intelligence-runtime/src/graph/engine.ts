import { IntelligenceObject } from '../types';

export interface GraphNode {
  id: string;
  type: string;
  data: IntelligenceObject;
  edges: GraphEdge[];
  createdAt: Date;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: string;
  strength: number;
  createdAt: Date;
}

export class CausalGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();

  addNode(data: IntelligenceObject): GraphNode {
    const node: GraphNode = {
      id: data.id,
      type: data.objectType,
      data,
      edges: [],
      createdAt: new Date(),
    };
    this.nodes.set(data.id, node);
    return node;
  }

  addEdge(from: string, to: string, type: string, strength: number): GraphEdge {
    const edge: GraphEdge = { from, to, type, strength, createdAt: new Date() };
    const key = `${from}-${to}-${type}`;
    this.edges.set(key, edge);

    const fromNode = this.nodes.get(from);
    if (fromNode) fromNode.edges.push(edge);

    return edge;
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  getNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  getRelated(nodeId: string, depth: number = 1): GraphNode[] {
    const node = this.nodes.get(nodeId);
    if (!node) return [];

    const related = new Set<GraphNode>();
    for (const edge of node.edges) {
      const target = this.nodes.get(edge.to);
      if (target) related.add(target);
    }
    return Array.from(related);
  }

  findByType(type: string): GraphNode[] {
    return this.getNodes().filter(n => n.type === type);
  }

  findByContent(query: string): GraphNode[] {
    const lower = query.toLowerCase();
    return this.getNodes().filter(n =>
      n.data.content.toLowerCase().includes(lower)
    );
  }

  getStats(): { nodes: number; edges: number } {
    return { nodes: this.nodes.size, edges: this.edges.size };
  }
}
