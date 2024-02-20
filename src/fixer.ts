// 开发的时候把这个地方解掉注释就有类型了，ts-node能跑import语法必须改package.json文件，所以不使用
// 跑这个文件的时候记得把node版本切换到16以上
import fs from 'fs';
import ts from 'typescript';
import path from 'path';
// const fs = require('fs');
// const ts = require('typescript');
// const path = require('path');
import { getCollecterFilePath } from './tools/getCollecterFilePath';
import { getImportClauseAddElementStr } from './tools/getImportClauseAddElementStr';

export function fixDvaType(userPath: string): Promise<string | void> {
    return new Promise((resolve, reject) => {
        let modelTypeName: string = '';
        // 获取公共收集类型的文件路径
        const collecterFilePath = getCollecterFilePath(userPath);
        if (!collecterFilePath) {
            console.warn('找不到src路径');
            return;
        }
        // 生成公共收集的文件
        if (!fs.existsSync(collecterFilePath)) {
    fs.writeFileSync(collecterFilePath,
`import { NewModel, TypedDispatch } from '@/utils/dva-helper';

/** 在这里收集所有的models类型，以此推断全局类型 */
export type AllModelStateType = {
};

/** 传入自己model的key值，以此来获得自己model的具体类型 */
export type StatedModel<CurState extends keyof AllModelStateType> = NewModel<
AllModelStateType,
CurState
>;

/** 全局的dipatch的类型 */
export type StateTypedDispatch = TypedDispatch<AllModelStateType>;
`,
    );
        }
        // 读取要解析的JavaScript文件
        const filePath = path.resolve(__dirname, userPath);
        const code = fs.readFileSync(filePath, 'utf-8');
    
        // 使用 TypeScript API 解析代码
        const sourceFile = ts.createSourceFile(
            filePath,
            code,
            ts.ScriptTarget.Latest,
            /* setParentNodes */ true,
        );
    
        // ========================= 处理数据 =======================
        let stateStatement: ts.Statement = {} as ts.Statement;
        let modelObjectStatement: ts.Statement = {} as ts.Statement;
        let importDvaHelperStatement: ts.Statement = null as unknown as ts.Statement;
        let importModelsTypeStatement: ts.Statement = null as unknown as ts.Statement;
        let effectsNames: string[] = [];
        let modelName = '';
        console.log(sourceFile);
        
        sourceFile?.statements?.find((item: any): boolean => {
            if (item?.kind === 263) {
            // 这里找到了state的类的声明，记录下类的名字
                stateStatement = item;
                return false;
            }
    
            if (item?.moduleSpecifier?.text === '@/models/type') {
                importModelsTypeStatement = item;
            }
    
            if (item?.moduleSpecifier?.text === '@/utils/dva-helper' && item.importClause?.namedBindings?.elements?.every((item: any) => item.name.escapedText !== 'TypedModel')) {
                importDvaHelperStatement = item;
            }
    
            // ======================= 寻找model变量的effects属性的值 ==========================
            const values = item?.declarationList?.declarations?.[0]?.initializer
            ?.properties as any[];
            if (
            item?.declarationList?.kind === 261 &&
            values?.[0]?.name?.escapedText === 'namespace'
            ) {
                modelObjectStatement = item;
                const effects = values.find(
                    (propItem: any): boolean => propItem?.name?.escapedText === 'effects',
                );
    
                modelName = values?.[0]?.initializer?.text;
                modelTypeName = `${modelName}Model`;
                modelTypeName = `${modelTypeName[0].toUpperCase()}${modelTypeName.slice(1)}`;
                
                effectsNames = effects?.initializer?.properties?.map(
                    (propItem: any) => propItem?.name?.escapedText,
                );
                return true;
            }
            return false;
        });
    
        if (!modelTypeName || !modelObjectStatement) {
            console.warn('modelTypeName or modelObjectStatement didn\'t found');
            return;
        }
    
        // 创建属性签名
        const propertySignatures = [
            ts.factory.createPropertySignature(
            undefined,
            ts.factory.createIdentifier('state'),
            undefined,
            ts.factory.createTypeReferenceNode(
                ts.factory.createIdentifier((stateStatement as any).name.escapedText),
                undefined,
            ),
            ),
            ts.factory.createPropertySignature(
            undefined,
            ts.factory.createIdentifier('effects'),
            undefined,
            ts.factory.createTypeLiteralNode(
                effectsNames.map((item) =>
                ts.factory.createPropertySignature(
                    undefined,
                    ts.factory.createIdentifier(item),
                    undefined,
                    ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
                ),
                ),
            ),
            ),
        ];
    
        // 创建接口声明
        const interfaceDeclaration = ts.factory.createInterfaceDeclaration(
            [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
            ts.factory.createIdentifier(modelTypeName),
            undefined,
            [
            // 继承 TypedModel 接口
            ts.factory.createHeritageClause(ts.SyntaxKind.ExtendsKeyword, [
                ts.factory.createExpressionWithTypeArguments(
                ts.factory.createIdentifier('TypedModel'),
                undefined,
                ),
            ]),
            ],
            [
            // 添加属性签名
            ...propertySignatures,
            ],
        );
    
        // ====================== 在state 类的结尾后一行插入我们的接口类型 ==============
        const insertPosition = stateStatement.end;
        let newSourceCode = '';
        let headSourceCode = '';
    
        if (importDvaHelperStatement) {
            headSourceCode = getImportClauseAddElementStr((importDvaHelperStatement as any).importClause, sourceFile, 'TypedModel', insertPosition);
        } else {
            headSourceCode = sourceFile.text.slice(
                0,
                insertPosition,
            );
        }
    
        if (!importModelsTypeStatement) {
            headSourceCode = `import { StatedModel } from '@/models/type';\n${headSourceCode}`;
        }
    
        // 修改变量model的类型Model为TypedModel
        const modelObjectStatementTypeName = (modelObjectStatement as any).declarationList.declarations[0].type;
        if (modelObjectStatementTypeName.typeName.escapedText === 'Model') {
            console.log('found it', modelObjectStatementTypeName);
            newSourceCode = `${headSourceCode}\n${ts
                .createPrinter()
                .printNode(
                ts.EmitHint.Unspecified,
                interfaceDeclaration,
                sourceFile,
                )}${sourceFile.text.slice(insertPosition, modelObjectStatementTypeName.pos + 1)}StatedModel<'${modelName}'>${sourceFile.text.slice(modelObjectStatementTypeName.end)}`;
        } else {
            newSourceCode = `${headSourceCode}\n${ts
                .createPrinter()
                .printNode(
                ts.EmitHint.Unspecified,
                interfaceDeclaration,
                sourceFile,
                )}${sourceFile.text.slice(insertPosition)}`;
        }
    
    
        // ========================= 修改文件，声明类型接口并导出 ===================
        fs.writeFile(path.resolve(__dirname, filePath), newSourceCode, (err: any) => {
            if (err) {
            console.error('写入文件时发生错误:', err);
            } else {
            console.log('文件写入成功:', filePath);
            }
        });
    
        // ========================= 更新公共的类型收集 =========================
        fs.readFile(collecterFilePath, 'utf-8', (err: any, collecterCode: string) => {
            // 使用 TypeScript API 解析代码
            const collecterSourceFile = ts.createSourceFile(
            collecterFilePath,
            collecterCode,
            ts.ScriptTarget.Latest,
            /* setParentNodes */ true,
            );
            const AllModelStateTypeStatement = collecterSourceFile.statements.find(
            (item: any): boolean => item?.name?.escapedText === 'AllModelStateType',
            ) as any;
            const AllModelStateTypePos = AllModelStateTypeStatement?.pos;
            if (!AllModelStateTypePos) {
                console.warn('找不到AllModelStateType');
                return;
            }
            try {
                const updatedAllModelStateTypeDeclaration = ts.factory.updateTypeAliasDeclaration(
                    AllModelStateTypeStatement,
                    AllModelStateTypeStatement.modifiers,
                    AllModelStateTypeStatement.name,
                    AllModelStateTypeStatement.typeParameters,
                    ts.factory.createTypeLiteralNode([
                        ...(AllModelStateTypeStatement as any).type.members,
                        ts.factory.createPropertySignature(
                            undefined,
                            ts.factory.createIdentifier(modelName),
                            undefined,
                            ts.factory.createTypeReferenceNode(ts.factory.createIdentifier(modelTypeName)),
                        ),
                    ]),
                );
                
                const importFromUmi = collecterSourceFile.statements.find(
                (item: any): boolean =>
                    item?.importClause && item?.moduleSpecifier.text === 'umi',
                ) as any;
                if (importFromUmi) {
                    // 找到 importClause，这里假设 importClause 存在
                    const { importClause } = importFromUmi;
    
                    const importElements = importClause?.namedBindings?.elements as any[];
                    if (!importElements) {
                        throw new Error('找不到importElements');
                    }
                    const importEndPosition = importElements[importElements.length - 1].end;
    
                    const newCollecterSourceCode = `${collecterSourceFile.text.slice(
                        0,
                        importEndPosition,
                    )}, ${modelTypeName}${collecterSourceFile.text.slice(
                        importEndPosition,
                        AllModelStateTypeStatement.pos + 2,
                    )}${ts
                        .createPrinter()
                        .printNode(
                        ts.EmitHint.Unspecified,
                        updatedAllModelStateTypeDeclaration,
                        collecterSourceFile,
                        )}${collecterSourceFile.text.slice(AllModelStateTypeStatement.end)}`;
    
                    // 将新的文本写回源文件
                    fs.writeFileSync(collecterFilePath, newCollecterSourceCode);
                } else {
                    const newCollecterSourceCode = `import { ${modelTypeName} } from 'umi';\n${collecterSourceFile.text.slice(
                        0,
                        AllModelStateTypeStatement.pos + 2,
                    )}${ts
                        .createPrinter()
                        .printNode(
                        ts.EmitHint.Unspecified,
                        updatedAllModelStateTypeDeclaration,
                        collecterSourceFile,
                        )}${collecterSourceFile.text.slice(AllModelStateTypeStatement.end)}`;
    
                    // 将新的文本写回源文件
                    fs.writeFileSync(collecterFilePath, newCollecterSourceCode);
                }
            } catch (error) {
                reject(error);
            } finally {
                resolve(`文件写入成功, 修改model文件： ${filePath}，  修改全局收集文件： ${collecterFilePath}`)
            }
        });   
    });
}