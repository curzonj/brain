import { Command, flags } from "@oclif/command";
import { buildEditorStructure } from "../cli/editor";

export default class Show extends Command {

  public static args = [{name: "file"}];

  public async run() {
    const allDocs = await buildEditorStructure();

    this.log(JSON.stringify(allDocs.index, null, " "));
  }
}
