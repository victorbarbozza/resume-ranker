import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import {
  createCandidate,
  createReadyCandidate,
  generatedBy,
  profileWith,
} from '@/server/test/fixtures'

import * as candidatesRepo from './candidates'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

const run = (input: Partial<candidatesRepo.ShortlistInput>) =>
  candidatesRepo.shortlist({
    area: 'engineering',
    mustHave: [],
    niceToHave: [],
    limit: 20,
    ...input,
  })

const ids = async (input: Partial<candidatesRepo.ShortlistInput>) =>
  (await run(input)).map((entry) => entry.candidateId)

describe('candidates shortlist', () => {
  describe('ranking', () => {
    test('a skill outranks the same word in the profile summary', async () => {
      const inSummary = await createReadyCandidate({
        summary: 'Deployed services on Kubernetes.',
      })
      const inSkills = await createReadyCandidate({ skills: ['Kubernetes'] })

      const entries = await run({ mustHave: ['Kubernetes'] })

      expect(entries.map((e) => e.candidateId)).toEqual([inSkills, inSummary])
      expect(entries[0].rank).toBeGreaterThan(entries[1].rank * 4)
    })

    test('matching more requirements ranks higher', async () => {
      const one = await createReadyCandidate({ skills: ['Node.js'] })
      const three = await createReadyCandidate({
        skills: ['Node.js', 'Postgres', 'Kubernetes'],
      })
      const two = await createReadyCandidate({
        skills: ['Node.js', 'Postgres'],
      })

      expect(
        await ids({
          mustHave: ['Node.js'],
          niceToHave: ['Postgres', 'Kubernetes'],
        })
      ).toEqual([three, two, one])
    })

    test('returns at most the limit, best first', async () => {
      const best = await createReadyCandidate({ skills: ['Go', 'Kafka'] })
      await createReadyCandidate({ skills: ['Go'] })
      await createReadyCandidate({ skills: ['Go'] })

      const entries = await run({
        mustHave: ['Go'],
        niceToHave: ['Kafka'],
        limit: 2,
      })

      expect(entries).toHaveLength(2)
      expect(entries[0].candidateId).toBe(best)
    })
  })

  describe('filters', () => {
    test('needs at least one must-have; nice-to-haves only add rank', async () => {
      const niceOnly = await createReadyCandidate({ skills: ['Docker'] })
      const mustOnly = await createReadyCandidate({ skills: ['Go'] })
      const both = await createReadyCandidate({ skills: ['Go', 'Docker'] })

      const result = await ids({ mustHave: ['Go'], niceToHave: ['Docker'] })

      expect(result).toEqual([both, mustOnly])
      expect(result).not.toContain(niceOnly)
    })

    test('a job without must-haves filters on its nice-to-haves', async () => {
      const match = await createReadyCandidate({ skills: ['Terraform'] })
      await createReadyCandidate({ skills: ['Excel'] })

      expect(await ids({ niceToHave: ['Terraform'] })).toEqual([match])
    })

    test('a job with no searchable terms gets an empty shortlist', async () => {
      await createReadyCandidate({ skills: ['Go'] })

      expect(await ids({ mustHave: ['&&', ' '], niceToHave: [] })).toEqual([])
    })

    test('keeps candidates from other areas out', async () => {
      const engineer = await createReadyCandidate({ skills: ['Kubernetes'] })
      await createReadyCandidate({ skills: ['Kubernetes'], areas: ['design'] })
      const hybrid = await createReadyCandidate({
        skills: ['Kubernetes'],
        areas: ['data', 'engineering'],
      })

      const engineering = await ids({ mustHave: ['Kubernetes'] })
      const data = await ids({ area: 'data', mustHave: ['Kubernetes'] })

      expect(engineering.toSorted()).toEqual([engineer, hybrid].toSorted())
      expect(data).toEqual([hybrid])
    })

    test('searches only the LLM profile, never the raw resume text', async () => {
      await createReadyCandidate({
        skills: ['Python'],
        resumeText: 'Ran Kubernetes clusters for years.',
      })

      expect(await ids({ mustHave: ['Kubernetes'] })).toEqual([])
    })

    test('keeps pending and deleted candidates out', async () => {
      const ready = await createReadyCandidate({ skills: ['Rust'] })
      await createCandidate({ resumeText: 'Rust developer.' })
      const deleted = await createReadyCandidate({ skills: ['Rust'] })
      await candidatesRepo.softDelete(deleted)

      expect(await ids({ mustHave: ['Rust'] })).toEqual([ready])
    })
  })

  describe('term matching', () => {
    test('ignores case and accents', async () => {
      const candidate = await createReadyCandidate({
        skills: ['GESTÃO DE PROJETOS'],
        summary: 'Experiência com logística.',
      })

      expect(await ids({ mustHave: ['gestao de projetos'] })).toEqual([
        candidate,
      ])
      expect(await ids({ mustHave: ['Experiencia'] })).toEqual([candidate])
      expect(await ids({ mustHave: ['LOGÍSTICA'] })).toEqual([candidate])
    })

    test('tells C, C# and C++ apart', async () => {
      const c = await createReadyCandidate({ skills: ['C'] })
      const csharp = await createReadyCandidate({ skills: ['C#'] })
      const cpp = await createReadyCandidate({ skills: ['C++'] })

      expect(await ids({ mustHave: ['C#'] })).toEqual([csharp])
      expect(await ids({ mustHave: ['C++'] })).toEqual([cpp])
      expect(await ids({ mustHave: ['C'] })).toEqual([c])
    })

    test.each([
      ['NodeJS', 'Node.js'],
      ['node js', 'Node.js'],
      ['Golang', 'Go'],
      ['PostgreSQL', 'Postgres'],
      ['K8s', 'Kubernetes'],
      ['.NET', 'dotnet'],
      ['ReactJS', 'React'],
      ['CI/CD', 'ci / cd'],
    ])(
      'the skill %p matches the requirement %p',
      async (skill, requirement) => {
        const candidate = await createReadyCandidate({ skills: [skill] })

        expect(await ids({ mustHave: [requirement] })).toEqual([candidate])
      }
    )

    test('a multi-word requirement matches only as a phrase', async () => {
      const phrase = await createReadyCandidate({
        summary: 'Shipped machine learning models to production.',
      })
      await createReadyCandidate({
        summary: 'Fixed the coffee machine while learning Rust.',
      })

      expect(await ids({ mustHave: ['Machine Learning'] })).toEqual([phrase])
    })

    test('does not stem words: a plural does not find the singular', async () => {
      await createReadyCandidate({ summary: 'Led a team of developers.' })

      expect(await ids({ mustHave: ['developer'] })).toEqual([])
    })
  })

  test('a new profile replaces the old skills in the search document', async () => {
    const candidate = await createCandidate()
    await candidatesRepo.saveProfile(candidate.id, {
      name: null,
      profile: profileWith(['Java']),
      areas: ['engineering'],
      generatedBy,
    })

    await candidatesRepo.saveProfile(candidate.id, {
      name: null,
      profile: profileWith(['Elixir']),
      areas: ['engineering'],
      generatedBy,
    })

    expect(await ids({ mustHave: ['Java'] })).toEqual([])
    expect(await ids({ mustHave: ['Elixir'] })).toEqual([candidate.id])
  })
})
