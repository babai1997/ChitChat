const fs = require('fs');

const src = "/Users/sudiptap/.gemini/antigravity-ide/brain/647f66ce-102a-4a6d-957c-852e79ba7972/chichat_icon_1781461142041.png";
const dest1 = "./assets/icon.png";
const dest2 = "./assets/android-icon-foreground.png";

try {
  fs.copyFileSync(src, dest1);
  fs.copyFileSync(src, dest2);
  console.log("Successfully copied icon");
} catch(e) {
  console.error("Error:", e);
}
