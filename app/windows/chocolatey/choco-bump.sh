#!/bin/bash -e
#
# This script helps updating the version of Headlamp for the Chocolatey repository.
#
# Authors:
#   Joaquim Rocha <joaquim.rocha@microsoft.com>
#

usage() {
    cat <<EOF
Usage: $0 VERSION CHECKSUM [--pkg-version/-p PKG_VERSION] [--file/-f ]
Bump Headlamp's version for the chocolatey entry.

  VERSION             Headlamp's new version
  CHECKSUM            The Windows binary SHA256 checksum

The VERSION and CHECKSUM can be ommitted if the --file option is used.

Optional:

  -h, --help                    Display this help and exit
  -f, --file                    Path to a file to extract the version/checksum from
  -p, --pkg-version             The version for this package in case a different one is needed

Examples:
  $0 0.14.0 abcd1234
  $0 --file ./Headlamp-0.14.0-x64.exe --pkg-version 0.14.0.20220306

EOF
}

ARGS=$(getopt -o "hf:p:" -l "help,file:,pkg-version:" \
  -n "$0" -- "$@")
eval set -- "$ARGS"

FILE_NAME=
PKG_VERSION=

while true; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    -f|--file)
      FILE_NAME=$2
      shift
      shift
      ;;
    -p|--pkg-version)
      PKG_VERSION=$2
      shift
      shift
      ;;
    --)
      shift
      break
      ;;
    * )
	    shift
	    break
	    ;;
  esac
done

if (( $# != 2 )) && [ -z "${FILE_NAME}" ]; then
    echo "Error: Please provide a VERSION and CHECKSUM, or a file"
    echo ""
    usage
    exit 1
fi

if [ -z "${FILE_NAME}" ]; then
    VERSION=$1
    CHECKSUM=$2
else
    basename=$(basename "${FILE_NAME}")
    VERSION=$(echo ${basename} | sed -n 's/^.*Headlamp-\(.*\)-win.*\.exe/\1/p')
    CHECKSUM=$(sha256sum "${FILE_NAME}" | awk '{print $1}')
fi

if [ -z "$VERSION" ]; then
echo $VERSION
  echo "Version not specified" >&2
  exit 1
fi

if [ -z "$CHECKSUM" ]; then
  echo "Checksum not specified" >&2
  exit 1
fi

if [ -z "$PKG_VERSION" ]; then
  PKG_VERSION=$VERSION
fi

echo "Version is $VERSION"
echo "Pkg Version is $PKG_VERSION"
echo "Checksum is $CHECKSUM"

sed -i "s/<version>.*<\/version>/<version>${PKG_VERSION}<\/version>/" ./headlamp.nuspec
sed -i "s!^\$headlampVersion = '.*'!\$headlampVersion = '${VERSION}'!" ./tools/chocolateyinstall.ps1
sed -i "s/^\$checksum = '.*'/\$checksum = '${CHECKSUM}'/" ./tools/chocolateyinstall.ps1

echo ""
echo "You can test this package by running the following command from a Windows admin shell, in this directory:"
echo " choco pack"
echo " choco install headlamp -d -v -s ."
