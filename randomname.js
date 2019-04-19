const colors = ['red', 'blue', 'green', 'orange', 'yellow', 'black', 'green', 'white', 'pink', 'fuchsia', 'purple', 'lime', 'colorful',
    'rainbow', 'neon', 'clear', 'aquamarine', 'milky', 'cyan', 'brown', 'grey', 'beige', 'maroon', 'violet', 'golden'];
const adj = ['young', 'smart', 'rich', 'frosted', 'glossy', 'circular', 'rectangular', 'living', 'dead', 'edible',
    'explosive', 'scared', 'minty', 'tasty', 'fresh', 'new', 'old', 'open', 'stolen', 'spicy', 'flammable', 'liquid',
    'oppressive', 'hidden', 'secret', 'giant', 'happy', 'invisible', 'solid', 'dying', 'untouchable', 'trippy', 'burnt',
    'unstable', 'scary', 'ancient', 'polite', 'married', 'sketchy', 'scary', 'toxic', 'winged', 'watery', 'glowing',
    'angry', 'speedy', 'hollow', 'overpriced', 'expensive', 'french', 'american', 'british', 'asian', 'australian', 'convex', 'concave',
    'wooden', 'brittle', 'cracked', 'shattered', 'compressed', 'greedy', 'evil', 'elite', 'dark', 'gentrifying', 'chinese',
    'african', 'omniscient', 'enchanted', 'abusive', 'female', 'male', 'non-binary', 'binary', 'foreign', 'conscious', 'pure', 'poor',
    'famous', 'rare', 'popular', 'illegal', 'common', 'pregnant', 'broke', 'political', 'psychotic', 'nervous', 'depressed', 'cute',
    'lonely', 'boring', 'desperate', 'guilty', 'powerful', 'rotten', 'communist', 'capitalist', 'grim', 'cryogenicallyfrozen'];
const noun = ['dog', 'cat', 'car', 'boat', 'coin', 'pie', 'bread', 'lamborghini', 'ferrari', 'phone', 'room', 'fish', 'website',
    'bird', 'chicken', 'essay', 'robot', 'box', 'apple', 'door', 'staircase', 'elephant', 'computer', 'folder',
    'cup', 'bowl', 'card', 'machine', 'store', 'burrito', 'taco', 'emoji', 'teacher', 'human', 'dolphin', 'peasant', 'disease',
    'coffee', 'student', 'athlete', 'wire', 'system', 'television', 'product', 'camera', 'window', 'grenade', 'game',
    'country', 'planet', 'meteor', 'president', 'soldier', 'advertisement', 'hamburger', 'circuit', 'racecar', 'anteater',
    'textbook', 'moon', 'truck', 'hoverboard', 'song', 'flamingo', 'horse', 'brick', 'tractor', 'governor', 'noise', 'maid', 'uncle',
    'shame', 'writer', 'game', 'pot', 'berry', 'farm', 'squirrel', 'frog', 'stranger', 'crown', 'flame', 'throne', 'earthquake',
    'blade', 'sponge', 'bomb', 'bubble', 'pig', 'cracker', 'spoon', 'sparkle', 'star', 'snake', 'theory', 'mist', 'quill', 'icicle',
    'dragon'];

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