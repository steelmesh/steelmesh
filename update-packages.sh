echo "Updating npm managed packages"
npm update

echo "Updating Comfy"
npm rm comfy && npm install https://github.com/DamonOehlman/comfy/tarball/master

echo "Updating quip"
npm rm quip && npm install https://github.com/caolan/quip/tarball/master

echo "Removing .gitignore files"
find node_modules -name .gitignore -exec rm {} \;