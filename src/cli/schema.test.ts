import * as schema from "./schema";

describe("schema.ts", () => {
  describe("getFieldType", () => {
    it("works", async () => {
      const contents = await schema.getSchemaContents();

      expect(schema.getFieldType(contents, 'editorNode', 'title')).toEqual('string')
      expect(schema.getFieldType(contents, 'editorNode', 'queue')).toEqual('array')
    })
  })
})
