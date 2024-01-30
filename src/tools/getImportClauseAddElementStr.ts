import ts from "typescript";

export function getImportClauseAddElementStr(importClause: any,sourceFile: ts.SourceFile, modelTypeName: string, endPosition: number) {
  const importElements = importClause?.namedBindings?.elements as any[];
  if (!importElements) {
    throw new Error("找不到importElements");
  }
  const importEndPosition = importElements[importElements.length - 1].end;

  return `${sourceFile.text.slice(
    0,
    importEndPosition,
    )}, ${modelTypeName}${sourceFile.text.slice(
        importEndPosition,
        endPosition,
    )}`;
}
