#!/usr/bin/env bash

# The env variable RANGE specifies the range of commits to be searched for the changelog.
# If unset the latest tag until origin/main will be set.
#
# The env variable GITHUB_TOKEN can specify a GitHub personal access token.
# Otherwise, one could run into GitHub rate limits. Go to
# https://github.com/settings/tokens to generate a token.

set -e

# Check if jq is installed
jq --version >/dev/null 2>&1 || {
    echo "could not find jq (JSON command line processor), is it installed?"
    exit 255
}

# Set the range of commits to be searched for the changelog
if [ -z "${RANGE}" ]; then
    LATEST_TAG=$(git describe --tags --abbrev=0)
    RANGE="${LATEST_TAG}..origin/main"
fi

echo "Generating changelog for range: ${RANGE}"

# Set the GitHub token if it is not set
if [ ! -z "${GITHUB_TOKEN}" ]; then
    GITHUB_AUTH="Authorization: Bearer ${GITHUB_TOKEN}"
    HEADERS=(-H "${GITHUB_AUTH}")
fi

# Define custom category mappings
declare -A custom_categories=(
    [enhancement]="✨ Enhancements"
    [bug]="🐞 Bug fixes"
    [frontend]="Frontend Changes"
    [backend]="Backend Changes"
    [documentation]="📝 Documentation"
    [plugins]="🧱 Plugins"
    [development]="💻 Development"
    [chart]="Helm charts"
    [other]="Other"
)

# Function to add a pull request to the appropriate category
add_to_category() {
    local label="$1"
    local title="$2"
    local pr="$3"
    local url="$4"
    local author="$5" 

    echo "- ${title} ([#${pr}](${url})) (${author})" >> "category_${label}.md"
}

# Prioritize labels based on their index in the categories list
get_priority_label() {
    local label_list="$1"
    local highest_priority="other"

    for category in "${!custom_categories[@]}"; do
        if [[ "$label_list" == *"$category"* ]]; then
            highest_priority="$category"
            break
        fi
    done

    echo "$highest_priority"
}

# Loop through the pull requests and categorize them
body=$(curl -s "${HEADERS[@]}" "https://api.github.com/repos/headlamp-k8s/headlamp/pulls?state=closed&per_page=100")
pull_requests=$(echo "${body}" | jq -r '.[] | select(.merged_at != null and .base.ref == "main") | select(.title | test("deps"; "i") | not) | [.number, .title, .html_url, .user.login, (.labels[].name | select(. != null)) // ""] | @tsv' | grep -v '^null')

# Loop through the categorized pull requests and append them to the respective files
while IFS=$'\t' read -r pr title url author labels; do
    if [ -z "$labels" ]; then
        priority_label=$(get_priority_label "$title")
    else
        priority_label=$(get_priority_label "$labels")
    fi

    # Check if the title contains "Fix" or "fix"
    if [[ "$title" =~ [Ff]ix ]]; then
        priority_label="bug"
    fi

    # Check if the title starts with "docs"
    if [[ "$title" =~ ^docs ]]; then
        priority_label="documentation"
    fi

    add_to_category "$priority_label" "$title" "$pr" "$url" "@$author"
done <<< "$pull_requests"

# Add headers for each category and append categorized pull requests to scripts/changelog.md
for category in "${!custom_categories[@]}"; do
    if [[ -s "category_${category}.md" ]]; then
        echo "## ${custom_categories[$category]}" >> scripts/changelog.md
        cat "category_${category}.md" >> scripts/changelog.md
        rm -f "category_${category}.md"
    fi
done

# Append pull requests without any category to the "Other" section
if [[ -s "category_other.md" ]]; then
    echo "## ${custom_categories[other]}" >> scripts/changelog.md
    cat "category_other.md" >> scripts/changelog.md
    rm -f "category_other.md"
fi
