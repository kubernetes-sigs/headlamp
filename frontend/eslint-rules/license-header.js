/**
 * Local ESLint rule: license-header
 *
 * Validates that every source file starts with the Apache 2.0 license block
 * comment. The copyright year is matched with \d{4} so any year is accepted.
 */

const EXPECTED_HEADER = [
  '',
  / \* Copyright \d{4} The Kubernetes Authors/,
  ' *',
  ' * Licensed under the Apache License, Version 2.0 (the "License");',
  ' * you may not use this file except in compliance with the License.',
  ' * You may obtain a copy of the License at',
  ' *',
  ' * http://www.apache.org/licenses/LICENSE-2.0',
  ' *',
  ' * Unless required by applicable law or agreed to in writing, software',
  ' * distributed under the License is distributed on an "AS IS" BASIS,',
  ' * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.',
  ' * See the License for the specific language governing permissions and',
  ' * limitations under the License.',
  ' ',
];

const FIX_HEADER_LINES = [
  '',
  ` * Copyright ${new Date().getFullYear()} The Kubernetes Authors`,
  ' *',
  ' * Licensed under the Apache License, Version 2.0 (the "License");',
  ' * you may not use this file except in compliance with the License.',
  ' * You may obtain a copy of the License at',
  ' *',
  ' * http://www.apache.org/licenses/LICENSE-2.0',
  ' *',
  ' * Unless required by applicable law or agreed to in writing, software',
  ' * distributed under the License is distributed on an "AS IS" BASIS,',
  ' * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.',
  ' * See the License for the specific language governing permissions and',
  ' * limitations under the License.',
  ' ',
];

function matchLine(actual, expected) {
  if (expected instanceof RegExp) {
    return expected.test(actual);
  }
  return actual === expected;
}

function matchesHeader(commentValue) {
  const lines = commentValue.split(/\r?\n/);
  if (lines.length !== EXPECTED_HEADER.length) {
    return false;
  }
  return lines.every((line, i) => matchLine(line, EXPECTED_HEADER[i]));
}

module.exports = {
  meta: {
    type: 'layout',
    docs: {
      description: 'Require Apache 2.0 license header',
    },
    fixable: 'code',
    schema: [],
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();

    return {
      Program(node) {
        const comments = sourceCode.getAllComments
          ? sourceCode.getAllComments()
          : sourceCode.getCommentsBefore(node.body[0] || node);

        const firstComment = comments.find((c) => c.type !== 'Shebang');

        const fixHeader = '/*' + FIX_HEADER_LINES.join('\n') + '*/';

        if (!firstComment || firstComment.type !== 'Block') {
          context.report({
            node,
            message: 'Missing license header',
            fix(fixer) {
              return fixer.insertTextBefore(node, fixHeader + '\n\n');
            },
          });
          return;
        }

        if (!matchesHeader(firstComment.value)) {
          context.report({
            node: firstComment,
            message: 'Invalid license header',
            fix(fixer) {
              return fixer.replaceText(firstComment, fixHeader);
            },
          });
        }
      },
    };
  },
};
