echo "Updating npm managed packages"
npm update

echo "Updating GeoJS"
npm install https://github.com/sidelab/geojs/tarball/master

echo "Updating quip"
npm install https://github.com/caolan/quip/tarball/master

echo "Removing .gitignore files"
find node_modules -name .gitignore -exec rm {} \;