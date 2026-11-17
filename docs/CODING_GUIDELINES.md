# Coding guidelines

Language-neutral guidelines for writing and changing code, for developers and for coding agents. They apply to any codebase. What
differs per codebase (language, stack, domain words, known plans) is written in that repository's **project profile**, see
[Appendix A](#appendix-a-project-profile-template).

The goal is code that a new reader understands on the first pass, and that is cheap to change when the business changes.

## 0. How to read this document

**Rule strength.** Every rule has an ID and a strength.

- **MUST**: always applies. If you believe a MUST rule is wrong for a case, stop and ask; do not break it silently.
- **SHOULD**: the default. You may deviate when following it makes this piece of code harder to read or change. When you deviate,
  say so in your summary of the work, with the rule ID and the reason.

**Order of precedence.** When two instructions conflict, the higher one wins:

1. The task you were given, and correct behaviour of the code.
2. The project profile of the repository.
3. For matters this document leaves to the language (letter case of names, form of an enum, formatting, how failures are reported):
   the conventions already used in the codebase.
4. The MUST rules in this document.
5. The SHOULD rules in this document.

**Scope.** The rules apply to code you write or change. Existing code that breaks a rule stays as it is unless the task is to change
it (see CHANGE-3).

**Examples.** The examples are pseudocode, not a real language. They are labelled `Avoid` or `Prefer`. Write your code in the idiom
and letter case of the target language, not in the style of the pseudocode. The examples use a web shop (orders, payments, refunds);
do not copy their names into a codebase with a different domain.

**Terms.**

- A **business rule** is a condition or calculation that a person outside the code (product owner, customer, legislator) could state
  and could decide to change. "A paid order can be refunded within 14 days" is a business rule. "The list is not empty" is not.
- A **pure function** gives the same answer for the same input and does no I/O (no database, network, file, screen, clock, random).
- The **boundary** is where the program meets the outside: HTTP handler, UI event, command line, message consumer, scheduled job.
- An **effect** is anything that touches the outside: database, network, file, screen, clock, random.

## 1. Way of working

Most mistakes are made before the first line is written: code is added without reading what is already there.

- **WORK-1 (MUST)** Read the code around your change before you write: the file, its callers, and one comparable feature. Do it the
  way the codebase already does it.
- **WORK-2 (MUST)** Before you write a new function, constant or type, search the codebase for an existing one that does the job
  (see DRY-2).
- **WORK-3 (MUST)** Use only functions, fields and libraries you have seen in the code or its documentation. Do not guess that
  something exists.
- **WORK-4 (MUST)** Run the formatter, the linter and the tests before you call the work done. The commands are in the project
  profile. Report a failure as a failure.
- **WORK-5 (MUST)** Go through the [self-check](#16-self-check) before you finish.
- **WORK-6 (MUST)** End with a short summary that names: every SHOULD rule you deviated from and why, every assumption you made about
  future needs (see DESIGN-5), and problems you saw but left alone (see CHANGE-3).

## 2. Simplicity

Simple code is code with few things to keep in your head: few branches, few layers, few names, no surprises.

- **KISS-1 (MUST)** Build what the task asks for. Do not add options, parameters, configuration, layers or features "in case".
- **KISS-2 (SHOULD)** Choose the most direct solution that meets the requirement. If two solutions work, take the one with fewer
  moving parts.
- **KISS-3 (SHOULD)** Prefer plain code over clever code. If a line needs a comment to explain *what* it does, write it out in more,
  simpler steps.
- **KISS-4 (SHOULD)** Use what the language, its standard library and the codebase already offer before you write your own.
- **KISS-5 (MUST)** Do not add a dependency (library, package, service) without naming it and the reason in your summary. Do not add
  one for something that takes a few lines to write.
- **KISS-6 (SHOULD)** Do not optimise for speed without a measured problem. But do not write code that is wasteful in an obvious way,
  such as a database query or network call inside a loop.
- **KISS-7 (MUST)** Remove code that your change makes unused: functions, parameters, imports, constants, tests of removed behaviour.

## 3. One source of knowledge

"Don't repeat yourself" is about knowledge, not about text. Each rule, each name and each fact has one place where it is defined.
Two pieces of code that look alike are not always a repetition; two definitions of the same rule always are.

- **DRY-1 (MUST)** A business rule is defined in one place. When you need it a second time, call the first definition or extract it;
  two copies of a rule will drift apart.
- **DRY-2 (MUST)** Search before you write. Look for the concept under the names the domain uses, not only the name you had in mind.
- **DRY-3 (SHOULD)** Code that is not a business rule (plumbing, formatting, set-up) may be duplicated once. Extract it at the third
  occurrence, when the real shape of the shared part is visible.
- **DRY-4 (SHOULD)** Do not merge code that only looks alike. The test: *if one copy has to change, must the other change with it,
  for the same reason?* If not, they are two things; keep them apart.
- **DRY-5 (SHOULD)** Derive a value from its source instead of storing a second copy that can go out of date.
- **DRY-6 (SHOULD)** When two programs need the same rule (server and client, real service and its mock), share one module instead of
  writing it twice, if the languages allow it.

## 4. Name the business rule

### Conditions

```
Avoid: the reader has to work out what the check means

    if order.status == "paid" and order.refund is none and daysBetween(order.paidAt, now) <= 14:
        ...

Prefer: the call site reads as a sentence, the rule is defined once

    if canRefundOrder(order, now):
        ...

    function canRefundOrder(order, now):
        return order.status == OrderStatus.Paid
           and order.refund is none
           and daysBetween(order.paidAt, now) <= REFUND_WINDOW_DAYS
```

- **RULE-1 (MUST)** A condition that combines two or more clauses into one business rule gets a function named after the rule.
- **RULE-2 (MUST)** Do not wrap a single comparison that already reads clearly. A wrapper adds a name to look up and no information.

  ```
  Avoid:   function isDelivered(order): return order.status == OrderStatus.Delivered
           if isDelivered(order): ...

  Prefer:  if order.status == OrderStatus.Delivered: ...
  ```

- **RULE-3 (SHOULD)** A single clause does get a name when the expression hides its meaning. The test: *does the name tell the reader
  something the expression does not?* `refund.amount >= order.total` says nothing; `isFullRefund(refund, order)` does.
- **RULE-4 (SHOULD)** Name the function after the rule, not after the mechanics: `canRefundOrder`, `hasOpenInvoice`. Not `checkOrder`,
  `validate2`.
- **RULE-5 (MUST)** Rule functions are pure. Time and data are passed in as arguments (see DESIGN-9).
- **RULE-6 (SHOULD)** A rule lives in the module that owns its concept (the order rules, the refund rules), not in a general
  `utils` module.
- **RULE-7 (SHOULD)** A calculation with a meaning gets a named value: `refundDeadline = addDays(order.paidAt, REFUND_WINDOW_DAYS)`.

### Constants

- **CONST-1 (MUST)** A number with a meaning gets a named constant (`REFUND_WINDOW_DAYS`). Numbers that explain themselves in place
  are not magic: `0`, `1`, an index, `count + 1`, `total / 2` for a half.
- **CONST-2 (MUST)** A string that is compared, switched on, stored or sent as a code (status, role, error code, event name, setting
  key) is defined once, in an enum or the nearest thing the language has, and used through that definition everywhere. A typing
  mistake then fails at once instead of silently never matching.

  ```
  Avoid:   if order.status == "paid": ...
  Prefer:  if order.status == OrderStatus.Paid: ...
  ```

- **CONST-3 (MUST)** Text that is only shown or logged (a label, a message, a log line) is not a magic string. Do not move it into
  a constant for the sake of this rule.
- **CONST-4 (SHOULD)** A list of such names is built from the one definition, not typed again as loose strings.

  ```
  Avoid:   REQUIRED_CHECKS = ["invoice", "address", "payment"]
  Prefer:  REQUIRED_CHECKS = [OrderCheck.Invoice, OrderCheck.Address, OrderCheck.Payment]
  ```

- **CONST-5 (SHOULD)** Use the form and letter case that the language and the codebase use for enums and constants. Make them
  immutable where the language allows it.
- **CONST-6 (SHOULD)** Tests use the same definitions as the code. One exception: when a value is part of a contract with the outside
  (an API field, a stored value), one test states the literal value, so an accidental change of the definition is caught.

## 5. Control flow

The reader should see the normal path of a function at the left margin.

```
Avoid: the real work is buried three levels deep

    function refundOrder(user, order, now):
        if user is not none:
            if order is not none:
                if canRefundOrder(order, now):
                    return createRefund(order)
                else:
                    fail OrderNotRefundable

Prefer: each failure leaves early, the normal path is last and flat

    function refundOrder(user, order, now):
        if user is none: fail NotAuthenticated
        if order is none: fail OrderNotFound
        if not canRefundOrder(order, now): fail OrderNotRefundable

        return createRefund(order)
```

`fail` stands for the way the codebase reports a failure (see ERR-1).

- **FLOW-1 (SHOULD)** Handle invalid and uninteresting cases first and leave the function (guard clauses).
- **FLOW-2 (MUST)** No `else` after a branch that ends in `return`, `throw` or another exit.
- **FLOW-3 (SHOULD)** At most two levels of nesting inside a function. The function body is level 0; every `if`, loop, `try` and
  nested callback adds one. A third level is a signal to extract a function or invert a condition.
- **FLOW-4 (SHOULD)** A chain of `if / else if` on one value becomes a lookup table, or a `switch` / `match`. Every `switch` has a
  default branch, unless the compiler checks that all cases are covered.
- **FLOW-5 (SHOULD)** No flag parameters (`render(true, false)`). Write two functions, or pass named options.
- **FLOW-6 (SHOULD)** Write conditions positive and explicit. Split a long `and` / `or` line into named parts (RULE-1).
- **FLOW-7 (MUST)** No conditional expression inside another conditional expression (nested ternary). One, for a simple value, is fine.
- **FLOW-8 (SHOULD)** Use the collection operations of the language (map, filter, find, comprehension) when they read clearer than a
  loop that mutates. When a chain needs a comment to be understood, name the intermediate step instead.

## 6. Functions

- **FUNC-1 (SHOULD)** A function does one thing and its name says what. If you need "and" to describe it, split it.
- **FUNC-2 (SHOULD)** A function stays at one level of detail: it either orchestrates named steps, or it does one low-level step.
  Not both.

  ```
  Prefer: the orchestration reads as the business process

      function placeOrder(customer, cart, now):
          assertCanPlaceOrder(customer, cart)
          order = buildOrder(customer, cart, now)
          orderRepository.save(order)
          notifyCustomerOfOrder(customer, order)
          return order
  ```

- **FUNC-3 (SHOULD)** A function of more than about 30 lines is a signal to look for a step to extract. It is a signal, not a limit:
  do not cut a function that reads well into pieces that are only used together.
- **FUNC-4 (SHOULD)** At most three parameters. Beyond that, pass one object with named fields.
- **FUNC-5 (MUST)** No hidden effects. A function that asks (`getOrder`, `isExpired`) does not change anything; a function that
  changes something says so in its name (`markOrderShipped`).
- **FUNC-6 (SHOULD)** Do not change the arguments you receive. Return a new value.

## 7. Naming

- **NAME-1 (SHOULD)** A name states what the thing is and why it exists. Prefer `remainingRefundDays`; avoid `d`, `flag`, `temp`.
- **NAME-2 (MUST)** Use the words of the domain, as listed in the project profile. One word per concept in the whole codebase; do not
  mix `order`, `purchase` and `sale` for the same thing.
- **NAME-3 (SHOULD)** Functions are verbs (`createRefund`), values and types are nouns (`refund`), booleans are questions starting
  with `is`, `has`, `can` or `should` (`isExpired`, `hasOpenInvoice`).
- **NAME-4 (SHOULD)** No negation in a name. Prefer `isExpired` with `not isExpired(...)`; avoid `isNotExpired`, `hasNoInvoice`.
- **NAME-5 (SHOULD)** No abbreviations except universal ones (`id`, `url`). No type in the name: avoid `orderList`, `strName`;
  prefer `orders`, `name`.
- **NAME-6 (SHOULD)** Avoid names that say nothing: `data`, `info`, `item`, `manager`, `helper`, `handle`, `process`, `doWork`.
- **NAME-7 (SHOULD)** The scope decides the length. A loop index may be `i`; a function used across modules has a full name.
- **NAME-8 (MUST)** Identifiers, comments, commit messages and docs are in the language the project profile names (English when it
  names none). Text shown to users is in the language of the product.

## 8. Comments

The code says *what*. A comment says *why*, and only when the why is not visible from the code.

- **DOC-1 (MUST)** Do not comment what the code does. Rename or extract instead.
- **DOC-2 (SHOULD)** Do comment: a reason that is not obvious, a business or legal constraint, a workaround for a specific bug or
  platform quirk (name it), a surprising performance choice, a warning about a consequence.
- **DOC-3 (MUST)** No commented-out code. Version control remembers it.
- **DOC-4 (MUST)** When you change code, change its comment in the same edit, or remove it.
- **DOC-5 (SHOULD)** An exported function whose contract is not clear from its signature gets a short doc comment: what it guarantees
  and how it fails.

```
Avoid:   // Check if the order is expired
         if order.expiresAt < now: ...

Prefer:  // The payment provider keeps a reservation for 7 days; after that the amount must be authorised again.
         if isReservationExpired(order, now): ...
```

## 9. Design: when to abstract

SOLID, DRY and the other principles are tools for a problem you have, not goals. Applied to the maximum they produce code that is
as hard to read as code without any structure. An experienced developer weighs each case: an abstraction costs reading effort
today, and pays back only if the variation it prepares for really comes. This section is how to make that trade-off.

### The decision

Answer three questions before you add an interface, a base type, a strategy, a registry, a generic parameter or a configuration option.

**Question 1: is there variation today?** Two or more real cases that exist now (two payment methods, three notification channels)
justify an abstraction over them. One case does not.

**Question 2: is there evidence that variation is coming?**

| Counts as evidence | Does not count as evidence |
| --- | --- |
| The task or the conversation says so ("we start with card, bank transfer comes later"). | "It might be useful later." |
| The project profile lists it under *known directions*. | "Most systems end up needing this." |
| The codebase already has a sibling concept with several variants built the same way. | Your own guess about what the business will want. |
| A ticket, roadmap or design document you were pointed to says so. | The principle itself ("open/closed says so"). |

**Question 3: how expensive is it to change later?**

- *Cheap to change*: code inside one module or one program, with a few callers you can see and edit. If you guess wrong, the repair
  is a refactor.
- *Expensive to change*: anything that data or other parties depend on. A database schema, a stored file or message format, a
  public API, an event contract, a URL, a published library interface. If you guess wrong, the repair is a migration or a breaking
  change.

Then act:

| | Cheap to change | Expensive to change |
| --- | --- | --- |
| **Variation exists today** | Abstract over the real cases. | Abstract over the real cases. |
| **Evidence of coming variation** | Leave a seam. Do not build the machinery. | Shape the expensive part for the known variants now; keep the code around it simple. |
| **No evidence** | Build the simple version. No seam. | **Ask before you write.** If you cannot ask, choose the simple version and state the assumption. |

- **DESIGN-1 (MUST)** Do not add an abstraction without variation today or evidence of coming variation. "It is more SOLID" is not
  a reason.
- **DESIGN-2 (MUST)** Look for the evidence before you decide: read the task again, the project profile, and how sibling concepts
  are built.
- **DESIGN-3 (SHOULD)** With evidence, leave a seam and nothing more (see below).
- **DESIGN-4 (MUST)** Ask before you write when the choice is expensive to change and the evidence does not settle it. Ask one
  concrete question with the options and their cost, for example: "Payments: only card is specified. Will there be other payment
  methods? It decides whether the table gets a `method` column now or a migration later."
- **DESIGN-5 (MUST)** Do not ask about choices that are cheap to change. Decide, and state the assumption in your summary, for
  example: "Assumed e-mail stays the only notification channel; kept `sendOrderConfirmation` direct, no channel abstraction."

### A seam, not machinery

A **seam** is a place where a second variant can be added later without touching the callers: the concept sits behind one function
or module with a small interface, and the callers do not know the details. It costs almost nothing. **Machinery** is everything you
would build for variants that exist: interfaces, registries, factories, plug-in loading, configuration.

```
Situation: only card payments exist. Bank transfer has been discussed for next year.

Avoid (no seam): every caller knows it is a card

    // in the checkout handler, and again in the subscription handler
    cardProvider.charge(order.total, customer.cardToken)
    order.cardChargeId = ...

Prefer (a seam): callers ask for a payment; one module knows how

    // callers
    payment = takePayment(order, paymentDetails)

    // payment module
    function takePayment(order, paymentDetails):
        return chargeCard(order.total, paymentDetails.cardToken)

Avoid (machinery too early): built for variants that do not exist

    interface PaymentProvider, class CardPaymentProvider, class PaymentProviderFactory,
    a registry of providers, a setting that selects the provider
```

When bank transfer arrives, `takePayment` gets a lookup from payment method to function. The callers do not change. In the same
situation the expensive part is shaped now: the payment record gets a `method` field, not an `isCard` boolean and not card-only
columns on the order.

### The principles, with judgement

| Principle | Use it like this | Sign you went too far |
| --- | --- | --- |
| **Single responsibility** | A module has one reason to change. Boundary code validates and maps; logic modules decide; data access modules store. | Many tiny files that are only ever used together. |
| **Open/closed** | When a list of variants keeps growing, use a lookup table or strategy map, so a new variant is an addition and not an edit of five `if`s. | An extension point for a variant that does not exist. |
| **Liskov substitution** | Anything that replaces another (a test fake, a mock service, a subtype) honours the same contract, including its failures. | A fake that is more forgiving than the real thing, so tests pass and production fails. |
| **Interface segregation** | Pass a function only what it needs: `isExpired(order, now)`, not the whole request and user. | An interface with one method for every type. |
| **Dependency inversion** | Business rules do not know about the database, the network or the clock. Pass in what makes code hard to test. | A dependency-injection framework or abstract factories in a small codebase. |

**Signs of too much abstraction**: an interface with one implementation and no evidence of a second; a function that only forwards
to another; a parameter or option that always gets the same value; a generic type used with one type; a layer you have to click
through to find the code that does the work.

**Signs of too little abstraction**: one change of a business rule needs edits in several files; the same `switch` on a type or
status appears in several places; a caller knows details of something it only uses; a function cannot be tested without a database.

Defaults:

- **DESIGN-6 (SHOULD)** Prefer functions and plain data over type hierarchies. Use a class or object with behaviour when state and
  behaviour belong together. Prefer composition over inheritance.
- **DESIGN-7 (SHOULD)** Separate decisions from effects. Compute *what should happen* in a pure function; let a thin outer layer
  *do* it (write to the database, send the e-mail, update the screen). This is the most useful design move there is: it makes the
  rule readable and testable.
- **DESIGN-8 (SHOULD)** Keep effects at the edges: boundary code and data access touch the outside, the logic in between does not.
- **DESIGN-9 (MUST)** Pass the clock in. A rule that depends on time takes `now` as a parameter; it does not read the system clock
  itself. The same holds for random values and generated IDs.
- **DESIGN-10 (SHOULD)** Do not reach through objects (`order.customer.address.country.vatRate`). Ask the nearest owner for what
  you need, or pass the value in.

## 10. Failures and edge cases

- **ERR-1 (MUST)** Report failures the way the language and the codebase already do (exceptions, result values, error returns); the
  project profile names it. One mechanism per layer; do not mix them.
- **ERR-2 (SHOULD)** An expected failure (order expired, not allowed, not found when it should exist) has a name of its own: a named
  error type or a named result code. It is mapped to a response (status, message) in one place.
- **ERR-3 (MUST)** Do not use the failure mechanism for a normal outcome. A search that finds nothing returns an empty result. Do
  not return `none` or `false` to mean "something went wrong" when the caller has to react.
- **ERR-4 (MUST)** Validate input once, at the boundary. Inside, work with data you can trust; do not repeat the checks in every
  function.
- **ERR-5 (MUST)** Never swallow a failure. Catch only where you can do something useful with it; otherwise let it travel up.
- **ERR-6 (MUST)** Log a failure with its context; answer the outside with a general message. Never send internal error text, stack
  traces or queries to a client.
- **ERR-7 (SHOULD)** Handle "no value" on purpose: one clear guard at the start, not defensive checks spread through the code.
- **ERR-8 (SHOULD)** Make illegal states hard to represent: explicit status values instead of several booleans, and one place that
  derives a computed state.

## 11. Data and state

- **DATA-1 (SHOULD)** Immutable by default. Change data only locally and visibly.
- **DATA-2 (SHOULD)** Give data an explicit shape (a type, a record, a schema, a documented structure) instead of passing loose
  maps around.
- **DATA-3 (MUST)** Do not switch the type checker off to get past an error (an `any` type, an unchecked cast, an ignore directive).
  Fix the type. If there is no other way, say why in a comment and in your summary.
- **DATA-4 (MUST)** Money is never a binary floating-point number; use whole minor units (cents) or a decimal type. A moment in time
  is stored with its time zone or in UTC.
- **DATA-5 (SHOULD)** State that comes from a server or a database has one owner in the program. Do not keep a second copy in local
  state.

## 12. Structure of files and modules

- **MOD-1 (SHOULD)** A file starts with its imports, then its constants, then the code. Constants are not scattered between functions.
- **MOD-2 (SHOULD)** Order a file from high level to low level where the language allows it: the exported function first, its helpers
  below, so the file reads from top to bottom.
- **MOD-3 (SHOULD)** Group code by feature, not by technical kind. A feature holds its boundary code, rules, data access and tests
  together.
- **MOD-4 (SHOULD)** A module exports a small surface. What is not exported is free to change.
- **MOD-5 (MUST)** No circular dependencies. Dependencies point inward: boundary and user interface depend on rules; rules do not
  depend on them.
- **MOD-6 (SHOULD)** No catch-all modules (`utils`, `helpers`, `common`). If something has no better home, its concept has no name
  yet; find the name.
- **MOD-7 (MUST)** Boundary code is thin: check access, validate, call the logic, map the result. No business rules and no queries.
- **MOD-8 (MUST)** Queries live in data access modules only. Those modules store and fetch; they do not decide.
- **MOD-9 (SHOULD)** User interface code renders; rules live elsewhere. A component or template calls a named rule from a pure
  module, and computes a named value above the markup instead of a long expression inside it. A single clear comparison may stay
  inline (RULE-2).
- **MOD-10 (SHOULD)** An action that reads, decides and writes in one transaction is split in three: pure **rules** that decide,
  **data access** steps that do not decide, and a **service** that puts the steps in order and receives its data access as an
  argument. The service locks the record it decides about, then checks, then writes, so the same action cannot be done twice at the
  same moment.

## 13. Security

- **SEC-1 (MUST)** Everything from outside is untrusted until validated at the boundary: request data, files, headers, messages,
  responses of other services.
- **SEC-2 (MUST)** Never build a query, a shell command, a file path or markup by gluing untrusted text into a string. Use
  parameters, argument lists and the escaping of the platform.
- **SEC-3 (MUST)** Check on the server, for every action, that this user may do this to this record. Hiding a button is not a check.
- **SEC-4 (MUST)** No secrets (keys, passwords, tokens) in code, tests, logs or error messages. No personal data in logs beyond what
  the project profile allows.

## 14. Tests

Code that is hard to test usually mixes decisions with effects (DESIGN-7).

- **TEST-1 (MUST)** New behaviour and every new business rule get a test. Test a rule through its named function.
- **TEST-2 (MUST)** A bug fix starts with a test that fails because of the bug.
- **TEST-3 (MUST)** Never weaken, skip or delete a test to make the build pass. If a test is wrong, say so and explain why before you
  change it.
- **TEST-4 (SHOULD)** Test behaviour and rules, not implementation details and not the wording of messages.
- **TEST-5 (SHOULD)** Name a test as a sentence about behaviour: `rejects a refund when the refund window has passed`.
- **TEST-6 (SHOULD)** Arrange, act, assert, in that order, with a blank line between them. One reason to fail per test.
- **TEST-7 (MUST)** Tests give the same result on every run: no real clock, no real network, no random values, no dependency on the
  order of the tests.
- **TEST-8 (SHOULD)** Cover the edges of a rule: the value on the limit, just before it and just after it, and the empty case.
- **TEST-9 (SHOULD)** Prefer real objects and small fakes over deep mocking. Replace only what is at the boundary (network, database,
  clock), never the unit under test.

## 15. Changes and consistency

- **CHANGE-1 (MUST)** Match the surrounding code: style, idiom, naming, amount of comments. Consistency beats personal preference.
- **CHANGE-2 (MUST)** Keep a change focused. No refactor that the task does not need.
- **CHANGE-3 (SHOULD)** Leave the lines you touch better than you found them. Problems in code you do not touch stay as they are;
  name them in your summary instead of fixing them.
- **CHANGE-4 (MUST)** Do not change a contract others depend on (an exported signature, an API field, a schema, a stored format)
  without saying so. If the task does not ask for it, ask first.
- **CHANGE-5 (MUST)** Leave nothing behind: no debug output, no dead code, no unused imports, no `TODO` without a reference to where
  the work is tracked.
- **CHANGE-6 (SHOULD)** Small changes that can be reviewed. A commit does one thing; its subject is a short imperative sentence.
- **CHANGE-7 (MUST)** Do not format by hand against the formatter, and do not switch a linter rule off to get past it.

## 16. Self-check

Go through this list before you finish. Each line names the rules it checks.

- [ ] Did I read the surrounding code and search for existing functions and constants before adding my own? (WORK-1, WORK-2, DRY-2)
- [ ] Did I build only what was asked, with no extra options, layers or dependencies? (KISS-1, KISS-5)
- [ ] Is every business rule defined once, in a function named after the rule? (DRY-1, RULE-1)
- [ ] Did I leave single clear comparisons inline? (RULE-2)
- [ ] Is every compared, stored or sent string and every meaningful number a named definition, and is display text left alone?
      (CONST-1, CONST-2, CONST-3)
- [ ] No `else` after an exit, no nested conditional expressions, at most two levels of nesting? (FLOW-2, FLOW-3, FLOW-7)
- [ ] Does each function do one thing at one level of detail, with no hidden effects? (FUNC-1, FUNC-2, FUNC-5)
- [ ] For every abstraction I added: can I name the variation that exists today, or the evidence that it is coming? (DESIGN-1)
- [ ] Did I ask about a choice that is expensive to change, and decide the cheap ones myself? (DESIGN-4, DESIGN-5)
- [ ] Are decisions pure, with time, data and effects passed in or kept at the edges? (RULE-5, DESIGN-7, DESIGN-9)
- [ ] Are failures reported the way the codebase does it, validated once at the boundary, and never swallowed? (ERR-1, ERR-4, ERR-5)
- [ ] Is untrusted input kept out of queries, commands and markup, and is access checked on the server? (SEC-2, SEC-3)
- [ ] Does new behaviour have a test, and did I leave existing tests as strict as they were? (TEST-1, TEST-3)
- [ ] Do my comments explain why, and are they still true? (DOC-1, DOC-4)
- [ ] Is the change focused, with nothing left behind, and did the formatter, linter and tests run? (CHANGE-2, CHANGE-5, WORK-4)
- [ ] Does my summary name my deviations, my assumptions and the problems I left alone? (WORK-6)

## Appendix A: project profile template

Each repository fills this in once, in its `AGENTS.md` or next to it. It holds everything these guidelines leave to the codebase.
Keep it short and keep it true; a section with nothing to say is left out.

```markdown
# Project profile

## Stack and commands
- Language and main frameworks:
- Format:            <command>
- Lint:              <command>
- Test:              <command>

## Language
- Identifiers, comments, commits and docs:   <for example English>
- Text shown to users:                       <for example Dutch>

## Domain words
One word per concept. Use these, and no synonyms.
- <word>: <what it means>

## Conventions these guidelines leave to the codebase
- Enums and constants: <form and letter case, for example "frozen object, UPPER_SNAKE_CASE, members in PascalCase">
- Failures:            <mechanism per layer, for example "services return a result object, handlers map it to a status">
- Layers and folders:  <where boundary code, rules, data access and services live>

## Known directions (evidence for DESIGN, question 2)
Things that are expected to vary or grow. Leave a seam here.
- <for example "Payment methods: only card now, bank transfer is planned">

## Settled (do not prepare for variation)
Things that will stay single. Keep them simple.
- <for example "One currency, one language, one database">

## Expensive to change (DESIGN, question 3)
Contracts that other parties or stored data depend on. Ask before changing their shape.
- <for example "The public API under /v1, the orders table, the webhook payload">

## Exceptions to the guidelines
- <rule ID>: <what this codebase does instead, and why>
```
