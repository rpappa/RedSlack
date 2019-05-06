const colors = ['red', 'blue', 'green', 'orange', 'green', 'pink', 'fuchsia', 'purple', 'lime', 'colorful', 'spotted',
    'rainbow', 'neon', 'clear', 'aquamarine', 'milky', 'cyan', 'brown', 'grey', 'beige', 'maroon', 'violet', 'golden'];
const adj = ['young', 'smart', 'rich', 'frosted', 'glossy', 'circular', 'rectangular', 'living', 'dead', 'edible',
    'explosive', 'scared', 'minty', 'tasty', 'fresh', 'new', 'old', 'open', 'stolen', 'spicy', 'flammable', 'liquid',
    'hidden', 'secret', 'giant', 'happy', 'invisible', 'solid', 'dying', 'untouchable', 'trippy', 'burnt',
    'unstable', 'scary', 'ancient', 'polite', 'sketchy', 'winged', 'watery', 'glowing', 'tart', 'detailed',
    'angry', 'speedy', 'hollow', 'overpriced', 'expensive', 'convex', 'concave', 'dirty', 'massive', 'rancid',
    'wooden', 'brittle', 'cracked', 'shattered', 'compressed', 'greedy', 'evil', 'elite', 'dark', 'gentrifying',
    'omniscient', 'enchanted', 'abusive', 'conscious', 'pure', 'poor', 'miniscule', 'royal', 'questionable',
    'famous', 'rare', 'popular', 'common', 'political', 'psychotic', 'cute', 'smelly', 'loud', 'dank', 'musty',
    'powerful', 'rotten', 'grim', 'cryogenicallyfrozen', 'modern'];
const noun = ['dog', 'cat', 'car', 'boat', 'coin', 'pie', 'bread', 'lamborghini', 'ferrari', 'phone', 'room', 'fish', 'website',
    'bird', 'chicken', 'essay', 'robot', 'box', 'apple', 'door', 'staircase', 'elephant', 'computer', 'folder',
    'cup', 'bowl', 'card', 'machine', 'store', 'burrito', 'taco', 'emoji', 'teacher', 'human', 'dolphin', 'peasant', 'disease',
    'coffee', 'student', 'athlete', 'wire', 'system', 'television', 'product', 'camera', 'window', 'grenade', 'game',
    'country', 'planet', 'meteor', 'president', 'soldier', 'advertisement', 'hamburger', 'circuit', 'racecar', 'anteater',
    'textbook', 'moon', 'truck', 'hoverboard', 'song', 'flamingo', 'horse', 'brick', 'tractor', 'governor', 'noise', 'maid', 'uncle',
    'shame', 'writer', 'game', 'pot', 'berry', 'farm', 'squirrel', 'frog', 'stranger', 'crown', 'flame', 'throne', 'earthquake',
    'blade', 'sponge', 'bomb', 'bubble', 'pig', 'cactus', 'spoon', 'sparkle', 'star', 'snake', 'theory', 'mist', 'quill', 'icicle',
    'dragon', 'zoo', 'ticket', 'jewel'];

const wordSeperator = " ";

module.exports.randomName = () => {
    if (Math.random() < 0.5) {
        return colors[Math.floor(Math.random() * colors.length)] + wordSeperator +
            adj[Math.floor(Math.random() * adj.length)] + wordSeperator +
            noun[Math.floor(Math.random() * noun.length)];
    }
    return adj[Math.floor(Math.random() * adj.length)] + wordSeperator +
        colors[Math.floor(Math.random() * colors.length)] + wordSeperator +
        noun[Math.floor(Math.random() * noun.length)];
}