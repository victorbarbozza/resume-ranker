import { describe, expect, test } from 'bun:test'

import { normalizeSearchText } from './normalize'

describe('normalizeSearchText', () => {
  test.each([
    ['KUBERNETES', 'kubernetes'],
    ['Gestão de Projetos', 'gestao de projetos'],
    ['Programação em C# e C++', 'programacao em csharp e cpp'],
    ['C, C# and C++ are different', 'c, csharp and cpp are different'],
    ['F# and .NET', 'fsharp and dotnet'],
    ['ASP.NET Core', 'aspnet core'],
    ['Node.js', 'nodejs'],
    ['NodeJS', 'nodejs'],
    ['node js', 'nodejs'],
    ['Next.js and React.js', 'nextjs and react'],
    ['ReactJS, VueJS', 'react, vue'],
    ['CI/CD', 'cicd'],
    ['ci / cd pipelines', 'cicd pipelines'],
    ['Golang', 'go'],
    ['PostgreSQL', 'postgres'],
    ['K8s', 'kubernetes'],
    ['JS and TS', 'javascript and typescript'],
    ['  many   spaces\n\tand lines  ', 'many spaces and lines'],
  ])('%p becomes %p', (input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected)
  })

  test('leaves words that only contain a rule untouched', () => {
    expect(normalizeSearchText('Cassandra, Csharpie, jsonpath, tsconfig')).toBe(
      'cassandra, csharpie, jsonpath, tsconfig'
    )
  })

  test('gives the same output when run twice', () => {
    const once = normalizeSearchText('C# / .NET, Node.js, Gestão, K8s')

    expect(normalizeSearchText(once)).toBe(once)
  })
})
