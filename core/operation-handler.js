// core/operation-handler.js

function getValue(obj, path) {
    return path.split('.').reduce((o, i) => (o ? o[i] : undefined), obj);
}

class OperationHandler {
    constructor(context, assetLoader) { 
        this.context = context;
        this.assetLoader = assetLoader;
    }

    execute(config) {
        const { operation, target, source, findBy, match, args } = config;

        if (operation.startsWith('custom:')) {
            const operationName = operation.substring(7);
            const customOperation = this.assetLoader.getOperation(operationName);
            if (customOperation) {
                const operationArgs = this._resolveArgs(args);
                return customOperation(this.context, operationArgs);
            } else {
                throw new Error(`OperationHandler Error: Custom operation '${operationName}' not found.`);
            }
        }

        const targetArray = getValue(this.context, target);
        if (!Array.isArray(targetArray)) {
            throw new Error(`OperationHandler Error: Target "${target}" is not an array.`);
        }

        switch (operation) {
            case 'push':
                this._handlePush(targetArray, source, findBy);
                break;
            case 'removeFirstWhere':
                this._handleRemove(targetArray, match);
                break;
            default:
                throw new Error(`OperationHandler Error: Unknown built-in operation "${operation}".`);
        }
    }

    _resolveArgs(argsConfig) {
        if (!argsConfig) return {};
        const resolvedArgs = {};
        for (const key in argsConfig) {
            resolvedArgs[key] = getValue(this.context, argsConfig[key]);
        }
        return resolvedArgs;
    }

    _handlePush(targetArray, source, findBy) {
        if (!source || !findBy) {
            throw new Error('OperationHandler Error: "push" operation requires "source" and "findBy".');
        }

        const sourceArray = getValue(this.context, source);
        if (!Array.isArray(sourceArray)) {
            throw new Error(`OperationHandler Error: Source "${source}" is not an array.`);
        }
        
        const findByKey = Object.keys(findBy)[0];
        const findByValuePath = findBy[findByKey];
        const valueToFind = getValue(this.context, findByValuePath);

        const itemToAdd = sourceArray.find(item => String(item[findByKey]) === String(valueToFind));
        
        if (itemToAdd) {
            targetArray.push(JSON.parse(JSON.stringify(itemToAdd)));
        }
    }

    _handleRemove(targetArray, match) {
        if (!match) {
            throw new Error('OperationHandler Error: "removeFirstWhere" operation requires "match".');
        }

        const matchKey = Object.keys(match)[0];
        const matchValuePath = match[matchKey];
        const valueToMatch = getValue(this.context, matchValuePath);
        
        const indexToRemove = targetArray.findIndex(item => String(item[matchKey]) === String(valueToMatch));

        if (indexToRemove > -1) {
            targetArray.splice(indexToRemove, 1);
        }
    }
}

module.exports = { OperationHandler };