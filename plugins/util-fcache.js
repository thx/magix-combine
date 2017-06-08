module.exports = (fn) => {
    let cache = Object.create(null);
    return (str) => {
        let hit = cache[str];
        return hit || (cache[str] = fn(str));
    };
};