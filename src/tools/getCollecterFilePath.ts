export function getCollecterFilePath(filePath: string) {
    // 将文件路径拆分为各个部分
    const parts = filePath.split('/');
  
    // 查找 'src' 的索引位置
    const srcIndex = parts.indexOf('src');
  
    // 如果 'src' 存在
    if (srcIndex !== -1) {
        parts.splice(srcIndex + 1, 0, 'models/type.ts');
    
        const finalPath = parts.slice(0, srcIndex + 2).join('/');
        console.log(finalPath);
        
        return finalPath;
    }
  
    // 如果没有找到对应的路径，返回 null 或者其他适当的值
    return null;
  }
  