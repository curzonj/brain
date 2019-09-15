declare module '@graphy/util.dataset.tree' {
  import * as RDF from 'rdf-js';

  function dataset_tree(): DatasetTree;

  export = dataset_tree;

  interface DatasetTree {
    size: number;
    [Symbol.iterator](): Iterator<RDF.Quad>;
    add(quad: RDF.Quad): DatasetTree;
    addQuads(quads: Iterable<RDF.Quad>): DatasetTree;
    minus(d: DatasetTree): DatasetTree;
  }
}
