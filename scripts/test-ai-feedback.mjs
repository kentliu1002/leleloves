import assert from 'node:assert/strict'
import { parseReview, formatReview, reconcileReviews, isUsableFeedback } from '../lib/ai-feedback.mjs'
const review = { summary: '已完成。', errors: [{ question: '一(4)', student: '1000万', correct: '6000万', reason: 'A位于第3小格，每格2000万。' }], uncertain: [{ question: '拓展', reason: '手写零的个数不清楚。' }] }
const reply = (data, finish = 'stop') => ({ choices: [{ finish_reason: finish, message: { content: JSON.stringify(data) } }] })
assert.equal(parseReview(reply(review)).errors.length, 1)
assert.throws(() => parseReview(reply(review, 'length')))
assert.throws(() => parseReview({ choices: [{ finish_reason: 'stop', message: { content: '哦不对，我重新来' } }] }))
assert.throws(() => parseReview(reply({ ...review, summary: '字'.repeat(1000) })))
assert.equal(parseReview(reply({ ...review, errors: [{ ...review.errors[0], correct: '1000万' }] })).errors.length, 0)
assert.throws(() => parseReview(reply({ ...review, errors: [{ ...review.errors[0], reason: '哦不对，我刚才看错了，重新来' }] })))
assert.throws(() => parseReview(reply({ summary: '完成', errors: [], uncertain: '看不清' })))
assert.match(formatReview(parseReview(reply(review))), /需核对/)
assert.doesNotMatch(formatReview(parseReview(reply({ ...review, errors: [] }))), /全部正确|所有题目都做对/)
assert.ok(formatReview(review).length < 800)
console.log('AI feedback regression tests passed')

assert.throws(() => parseReview(reply({ ...review, summary: '所有题目都做对了' })))

const disagreed = reconcileReviews({ ...review, errors: [] }, review)
assert.equal(disagreed.errors.length, 0)
assert.ok(disagreed.uncertain.some(item => item.question === '一(4)'))
const agreed = reconcileReviews(review, review)
assert.equal(agreed.errors.length, 1)
const risky = { summary: '完成', errors: [{ question: '拓展', student: '20600000000', correct: '206000000000', reason: '零的个数不对' }], uncertain: [] }
assert.equal(reconcileReviews(risky, risky).errors.length, 0)
assert.equal(reconcileReviews(risky, risky).uncertain.length, 1)

assert.equal(isUsableFeedback('旧批改'.repeat(600)), false)
assert.equal(isUsableFeedback('哦不对，我重新来'), false)
assert.equal(isUsableFeedback(formatReview(review)), true)
