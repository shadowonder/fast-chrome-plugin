const fs = require('fs');

// Function to read folder, get file names, and replace placeholders
function processFolder(folderPath, matcher, placeholder) {
    if (!fs.existsSync(folderPath)) {
        console.log("Folder", folderPath, "not exists");
        return;
    }

    fs.readdir(folderPath, (err, files) => {
        if (err) {
            console.error(`Error reading folder: ${folderPath}`, err);
            return;
        }
        files.forEach(f => console.log("match:", f.match(matcher)))
        const fileList = files.filter((file) => file.match(matcher)).map((file) => `"static/js/${file}"`).join(',');
        console.log("Update:", fileList);
        let data = fs.readFileSync("build/manifest.json", "utf8");
        const updatedData = data.replace(placeholder, fileList);
        fs.writeFileSync("build/manifest.json", updatedData, "utf8")
    });
}

const manifestFile = "build/manifest.json";

// Function to read folder, get file names, and replace placeholders
function processFolder(folderPath, matcher, prefix, key) {
    if (!fs.existsSync(folderPath)) {
        console.log("Folder", folderPath, "not exists");
        return;
    }

    // Read the JSON file synchronously
    const jsonData = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));

    // Get the list of file names in the folder add the file names array to the JSON object
    jsonData.content_scripts[0][key] = fs.readdirSync(folderPath)
        .filter((file) => file.match(matcher))
        .map((file) => `${prefix}${file}`);

    // Write the updated JSON back to the file
    fs.writeFileSync(manifestFile, JSON.stringify(jsonData, null, 2));

    console.log('JSON file updated successfully.');
}

// update js
processFolder('build/static/js', /.*\.js$/g, "static/js/", "js");
// update css
processFolder('build/static/css', /.*\.css$/g, "static/css/", "css");