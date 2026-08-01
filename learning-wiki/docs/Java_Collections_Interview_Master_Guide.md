# Java Collections Framework — Interview Master Guide
*Target: 8+ YOE / Architect-Lead role, with scenario coverage across 2–8+ yrs*

---

## PART 1: DEEP KNOWLEDGE GUIDE

### 1.1 Framework Overview

The Java Collections Framework (JCF) is a unified architecture for representing and manipulating groups of objects. Its root interfaces:

```
Iterable<T>
   └── Collection<T>
         ├── List<T>        (ordered, duplicates allowed, index access)
         ├── Set<T>         (no duplicates)
         │      └── SortedSet<T> → NavigableSet<T>
         └── Queue<T>
                └── Deque<T>

Map<K,V>  (NOT a Collection — separate hierarchy)
   └── SortedMap<K,V> → NavigableMap<K,V>
```

Key design principles interviewers probe:
- `Map` deliberately does **not** extend `Collection` — a map's "elements" are key-value pairs, not single objects, and the contract (unique keys, `get(key)`) doesn't fit `Collection`'s contract (`contains(Object)` over elements).
- Collections are built around **interfaces (abstraction) vs implementations** — always code to `List`, `Map`, `Set`, not `ArrayList`, `HashMap`, `HashSet`. This is testable in "why" form: it lets you swap implementations (e.g., `ArrayList` → `LinkedList`) without touching calling code, supports polymorphism, and is enforced by static analysis in most enterprise codebases.
- `AbstractList`, `AbstractSet`, `AbstractMap` provide skeletal implementations — asked when candidates are asked "how would you write a custom List?"

---

### 1.2 List Implementations

#### ArrayList
Backed by a dynamically resizing `Object[]` array.

```java
List<String> list = new ArrayList<>();  // default capacity 10 (lazily allocated since Java 8 — empty array until first add)
list.add("a");
```

**Internal working:**
- Default constructor: `elementData = DEFAULTCAPACITY_EMPTY_ELEMENTDATA` (an empty array) — the actual array of size 10 is only allocated on the **first `add()`** (lazy init, since Java 8, saves memory for empty lists).
- Growth: when full, `grow()` computes `newCapacity = oldCapacity + (oldCapacity >> 1)` → **1.5x growth**, then does `Arrays.copyOf()` — an O(n) operation.
- `add(index, element)` uses `System.arraycopy()` to shift elements — O(n).
- `get(index)` is O(1) — direct array index.
- `remove(index)` is O(n) — shifts elements left via `System.arraycopy`.

```java
// Amortized cost analysis interviewers like to hear:
// n additions cost O(n) amortized even though occasional resizes are O(n),
// because resizes happen geometrically less often (doubling/1.5x argument)
```

#### LinkedList
Doubly-linked list; implements both `List` and `Deque`.

```java
private static class Node<E> {
    E item;
    Node<E> next;
    Node<E> prev;
}
```
- `get(index)` is O(n) — must walk from head or tail (whichever is closer, `LinkedList` optimizes by picking the shorter side using `index < size/2`).
- `addFirst`/`addLast`/`removeFirst`/`removeLast` are O(1) — pointer updates only.
- Higher per-element memory overhead than `ArrayList` (each node: object header + 2 references + value ≈ 32–40 bytes overhead per element on a 64-bit JVM with compressed oops, vs near-zero overhead for `ArrayList`'s contiguous array).

#### Vector / Stack (legacy)
- `Vector` is `ArrayList`'s synchronized ancestor (every method `synchronized`) — legacy, pre-dates Collections Framework (JDK 1.0), retrofitted to implement `List` in JDK 1.2.
- Growth factor is 2x by default (vs ArrayList's 1.5x) unless `capacityIncrement` set.
- `Stack extends Vector` — considered a design mistake (inheritance instead of composition); prefer `ArrayDeque` as a stack via `push`/`pop`.

#### CopyOnWriteArrayList
- Every mutation (`add`, `set`, `remove`) copies the entire underlying array.
- Reads are lock-free and never blocked, never throw `ConcurrentModificationException` — iterators operate on a **snapshot**.
- Ideal for read-heavy, write-rare scenarios (e.g., listener lists). Write cost is O(n) per mutation — expensive for write-heavy use.

**Comparison Table:**

| | ArrayList | LinkedList | Vector | CopyOnWriteArrayList |
|---|---|---|---|---|
| Backing structure | Dynamic array | Doubly linked nodes | Dynamic array | Dynamic array (copied on write) |
| get(index) | O(1) | O(n) | O(1) | O(1) |
| add at end | O(1) amortized | O(1) | O(1) amortized | O(n) |
| add/remove middle | O(n) | O(1) once positioned, O(n) to find | O(n) | O(n) |
| Thread-safe | No | No | Yes (synchronized, coarse) | Yes (lock-free reads) |
| Memory overhead/element | Low | High (node objects) | Low | Low |
| Iterator behavior | Fail-fast | Fail-fast | Fail-fast | Fail-safe (snapshot) |

---

### 1.3 Set Implementations

#### HashSet
Backed internally by a `HashMap<E, Object>` where every element is a key and the value is a dummy constant `PRESENT`.

```java
public HashSet() {
    map = new HashMap<>();
}
public boolean add(E e) {
    return map.put(e, PRESENT) == null;
}
```
- No ordering guarantee.
- O(1) average for add/remove/contains, degrades to O(log n) worst case in Java 8+ if a bucket treeifies (see 1.6).

#### LinkedHashSet
Extends `HashSet`, backed by `LinkedHashMap` — maintains **insertion order** via an internal doubly-linked list threading through the hash entries. Slightly more memory/CPU overhead than `HashSet` for that ordering guarantee.

#### TreeSet
Backed by `TreeMap` (a Red-Black tree). Maintains **sorted order** (natural ordering via `Comparable`, or a supplied `Comparator`).
- add/remove/contains: O(log n).
- Supports range views: `headSet()`, `tailSet()`, `subSet()`, and navigation: `floor()`, `ceiling()`, `higher()`, `lower()`.

#### EnumSet
Specialized `Set` for enum types, internally backed by a **bitvector** (a `long` for ≤64 enum constants — `RegularEnumSet`, or a `long[]` for more — `JumboEnumSet`). Extremely fast (bitwise operations) and memory-compact — always prefer over `HashSet<SomeEnum>` when the domain is an enum.

**Comparison Table:**

| | HashSet | LinkedHashSet | TreeSet | EnumSet |
|---|---|---|---|---|
| Ordering | None | Insertion order | Sorted | Natural enum declaration order |
| add/contains | O(1) avg | O(1) avg | O(log n) | O(1) (bit ops) |
| Backing structure | HashMap | LinkedHashMap | TreeMap (Red-Black tree) | bit vector |
| Allows null | One null | One null | No (NPE on compareTo) | No |

---

### 1.4 Map Implementations

#### HashMap — the single most-probed structure in Java interviews

**Structure (Java 8+):**
```java
transient Node<K,V>[] table;   // array of buckets
static class Node<K,V> {
    final int hash;
    final K key;
    V value;
    Node<K,V> next;   // singly linked list within a bucket
}
```

**put() internal working, step by step:**
1. Compute `hash(key)`: `(h = key.hashCode()) ^ (h >>> 16)` — this XOR-spread mixes the high bits into the low bits, because `table.length` is always a power of 2 and the bucket index is computed as `hash & (table.length - 1)` (equivalent to `hash % length` but faster). Without spreading, keys whose hashCodes differ only in high bits would all collide in the same low-order bucket.
2. Locate bucket via `hash & (n - 1)`.
3. If bucket empty → insert new `Node`.
4. If bucket occupied → walk the chain, compare `hash` first (cheap int compare) then `equals()` (expensive) to find an existing key; if found, overwrite value; else append to the chain (Java 8+: append at **tail**, not head — this was a behavior change from Java 7, which prepended, and is relevant to the classic Java 7 HashMap infinite-loop-on-resize-during-concurrent-modification bug).
5. If chain length in a bucket reaches **8** AND table capacity ≥ **64**, the bucket **treeifies** into a Red-Black tree (`TreeNode extends Node`) — degrades worst-case lookup from O(n) to O(log n). This exists specifically as a DoS mitigation (an attacker feeding many colliding hashCodes into a public-facing HashMap could previously force O(n) lookups).
6. If a treeified bucket shrinks back to **6** entries (on removal), it **untreeifies** back to a linked list.
7. After insert, if `size > threshold` (`threshold = capacity * loadFactor`, default loadFactor = 0.75), **resize**: capacity doubles, and every existing entry is rehashed into the new table. Java 8 has a clever optimization here: since capacity is always a power of 2, an entry either stays at the same index or moves to `oldIndex + oldCapacity` — determined by a single bit check (`hash & oldCap`), avoiding full rehash computation.

**Why load factor 0.75?** It's the JDK's tuned trade-off between time cost (higher load factor → more collisions → slower lookups) and space cost (lower load factor → more wasted, unused buckets). 0.75 is empirically a good balance for uniformly distributed `hashCode()`s (documented in the `HashMap` Javadoc itself).

**equals()/hashCode() contract — always tested:**
- If `a.equals(b)` is true, `a.hashCode() == b.hashCode()` **must** be true.
- The reverse is not required (hash collisions are legal — different objects can share a hashCode).
- Violating this contract silently breaks `HashMap`/`HashSet` — e.g., overriding `equals()` without `hashCode()` means two "equal" objects can land in different buckets and both get stored, or a key you just `put()` becomes unfindable via `get()` because a mutable field used in `hashCode()` changed after insertion (classic bug: using a mutable object as a HashMap key).

```java
// Classic interview trap — mutable key bug
class Point { int x, y; /* hashCode/equals based on x,y */ }
Map<Point, String> map = new HashMap<>();
Point p = new Point(1, 2);
map.put(p, "A");
p.x = 99;              // mutate the key AFTER insertion
map.get(p);             // returns null! hashCode changed, wrong bucket is searched
```

#### LinkedHashMap
`HashMap` + a doubly-linked list threading through all entries to maintain iteration order. Two modes:
- **Insertion order** (default).
- **Access order** (`accessOrder=true` constructor flag) — every `get()` moves the entry to the end of the list. Combined with overriding `removeEldestEntry()`, this is the textbook way to build an **LRU cache** in a few lines:

```java
class LRUCache<K,V> extends LinkedHashMap<K,V> {
    private final int capacity;
    LRUCache(int capacity) {
        super(16, 0.75f, true);   // true = access-order
        this.capacity = capacity;
    }
    protected boolean removeEldestEntry(Map.Entry<K,V> eldest) {
        return size() > capacity;
    }
}
```

#### TreeMap
Red-Black tree implementation of `NavigableMap`. O(log n) for get/put/remove. Sorted by natural order or a `Comparator`. Supports `firstKey()`, `lastKey()`, `floorKey()`, `ceilingKey()`, `subMap()`, etc. Not thread-safe.

#### Hashtable
Legacy (JDK 1.0), every method `synchronized` at the object-monitor level (coarse-grained — blocks the *entire map* for any operation, even reads). Does not allow null key or null value (unlike `HashMap`, which allows one null key and multiple null values). Effectively obsolete — use `ConcurrentHashMap` instead.

#### ConcurrentHashMap — heavily probed at senior/architect level

**Java 7 and earlier:** Segmented locking. The map was divided into `Segment[]` (default 16 segments), each an independently-lockable mini hash table. Concurrency level ≈ number of segments — up to 16 threads could write concurrently without blocking each other (as long as they hit different segments).

**Java 8+ (complete redesign):**
- No more `Segment` array — back to a single `Node<K,V>[] table`, structurally similar to `HashMap`.
- Concurrency achieved via:
  - **CAS (Compare-And-Swap)** for inserting into an *empty* bucket (`Unsafe.compareAndSwapObject` — lock-free).
  - **`synchronized` on the first node of a bucket** only when appending to a non-empty bucket/bin — this is fine-grained (per-bucket) locking, not whole-map locking.
  - Treeification at 8 elements per bin (same as HashMap).
- `size()` is computed via a striped `LongAdder`-like counter (`baseCount` + `CounterCell[]`) to avoid a single contended counter under high concurrency.
- Reads (`get`) are **entirely lock-free** — volatile reads of `Node.val`/`Node.next`.
- Iterators are **weakly consistent**: they reflect the state of the map at some point during iteration, may or may not reflect later modifications, and never throw `ConcurrentModificationException`.
- Null keys/values are **not allowed** (unlike `HashMap`) — this is deliberate: in a concurrent map, `map.get(key) == null` is ambiguous (does the key not exist, or does it map to `null`?) and Doug Lea explicitly disallowed nulls to remove that ambiguity from concurrent code.

```java
// Atomic compound operations unique value over HashMap+external locking
map.computeIfAbsent(key, k -> expensiveCompute(k));   // atomic
map.merge(key, 1, Integer::sum);                        // atomic increment pattern
```

#### WeakHashMap
Keys held via `WeakReference`. When a key has no other strong references, the GC can reclaim it, and the entry is automatically removed from the map (on next access or via `ReferenceQueue` cleanup during operations). Common use: caches that shouldn't prevent key objects from being garbage collected (e.g., class-metadata caches keyed by `Class<?>`, listener registries).

#### IdentityHashMap
Uses reference equality (`==`) instead of `.equals()`/`.hashCode()` for key comparison — internally uses `System.identityHashCode()`. Used rarely — topology-preserving object graph traversal (e.g., serialization frameworks tracking already-visited objects), where two "equal" but distinct objects must be treated as different keys.

**Comparison Table:**

| | HashMap | LinkedHashMap | TreeMap | Hashtable | ConcurrentHashMap |
|---|---|---|---|---|---|
| Ordering | None | Insertion/access | Sorted | None | None |
| Null key/value | 1 null key, many null values | Same as HashMap | No null key (NPE) | No nulls at all | No nulls at all |
| Thread-safe | No | No | No | Yes (coarse, whole-map lock) | Yes (fine-grained, bucket-level) |
| get/put complexity | O(1) avg, O(log n) worst (treeified) | O(1) avg | O(log n) | O(1) avg | O(1) avg, lock-free reads |
| Concurrent iteration | Fails fast (CME) | Fails fast | Fails fast | Fails fast | Weakly consistent, no CME |

---

### 1.5 Queue / Deque

- **PriorityQueue**: binary heap (array-backed, not a real tree). O(log n) offer/poll, O(1) peek. Not thread-safe. Ordering via natural order or `Comparator`. NOT sorted iteration order (only the head is guaranteed to be the min/max) — a classic trap: `for (int x : priorityQueue)` does **not** iterate in priority order.
- **ArrayDeque**: resizable circular array (`head`/`tail` indices). Preferred over `LinkedList`/`Stack` for both stack (`push`/`pop`) and queue (`offer`/`poll`) use — better cache locality, no per-node allocation, generally faster. Cannot hold `null` (null is used internally as a "slot empty" sentinel).
- **BlockingQueue family** (`java.util.concurrent`): `ArrayBlockingQueue` (bounded, array-backed, single lock), `LinkedBlockingQueue` (optionally bounded, linked nodes, separate put/take locks for higher throughput), `PriorityBlockingQueue` (unbounded, heap-backed), `SynchronousQueue` (zero capacity — every `put` must rendezvous with a `take`, used heavily in `Executors.newCachedThreadPool()`), `DelayQueue` (elements become available only after a delay expires — used for scheduling/retry mechanisms).

---

### 1.6 Iterators: Fail-Fast vs Fail-Safe

- **Fail-fast** (`ArrayList`, `HashMap`, `HashSet`, etc.): maintains a `modCount` field, incremented on every structural modification. The iterator captures `expectedModCount` at creation; every `next()` call checks `modCount == expectedModCount` and throws `ConcurrentModificationException` if they diverge. This is a **best-effort** detection mechanism, not a guarantee (the JDK explicitly documents it should not be relied upon for correctness — only for bug detection).
  - Trap: `list.remove(item)` inside a for-each loop throws CME. `iterator.remove()` (via explicit `Iterator`) is the safe way to remove during iteration.
- **Fail-safe** (`CopyOnWriteArrayList`, `ConcurrentHashMap`): iterate over a snapshot or a weakly-consistent view; never throw CME, but may not reflect concurrent modifications made after the iterator was created.

**Iterator vs ListIterator vs Spliterator:**
- `Iterator`: forward-only, `hasNext()`/`next()`/`remove()`.
- `ListIterator` (List only): bidirectional, `hasPrevious()`/`previous()`, `set()`, `add()`, and index-aware (`nextIndex()`/`previousIndex()`).
- `Spliterator` (Java 8+): designed for parallel traversal — supports `trySplit()` to partition a source for parallel streams; carries characteristics (`ORDERED`, `SIZED`, `DISTINCT`, `SORTED`, etc.) that stream operations use to optimize (e.g., skip sorting if already `SORTED`).

---

### 1.7 Comparable vs Comparator

| | Comparable | Comparator |
|---|---|---|
| Package | java.lang | java.util |
| Method | `compareTo(T o)` | `compare(T o1, T o2)` |
| Where defined | Inside the class itself (natural ordering, one per class) | External, separate class/lambda (any number of orderings) |
| Use case | "This is the default/natural order of this type" | "Sort this collection by an alternate/ad-hoc order" |

```java
// Java 8+ Comparator composition — frequently asked to write live
list.sort(Comparator.comparing(Employee::getDept)
                     .thenComparing(Employee::getSalary, Comparator.reverseOrder())
                     .thenComparing(Employee::getName));
```

`compareTo`/`compare` contract: must be consistent (antisymmetric, transitive), and ideally **consistent with equals** — `TreeSet`/`TreeMap` use `compareTo`/`compare` (not `equals`!) to determine element/key equality, meaning two objects that are `compareTo == 0` are treated as duplicates and only one is retained, even if `equals()` would say they differ. This is a classic tricky-question trap.

---

### 1.8 Immutability

```java
List.of(1, 2, 3);                          // Java 9+, truly immutable, throws UnsupportedOperationException on mutation, throws NPE if any element is null
Collections.unmodifiableList(list);        // Java 1.2+, a VIEW — the underlying list can still be mutated directly, and that mutation IS visible through the view (common trap)
Collections.emptyList();                   // singleton immutable empty list
```

Trap: `Collections.unmodifiableList(list)` does **not** make `list` itself immutable — it only prevents mutation *through the returned view*. If the original reference is still mutated, the "unmodifiable" view changes too.

---

### 1.9 Collections Utility Class Highlights

- `Collections.sort()`, `Collections.binarySearch()`, `Collections.reverse()`, `Collections.synchronizedList()/Map()/Set()` (wraps with a single coarse lock — legacy alternative to `Vector`/`Hashtable`, still requires **manual synchronization on the wrapper object during iteration**, a very common trap), `Collections.max()/min()`, `Collections.frequency()`.

```java
List<String> syncList = Collections.synchronizedList(new ArrayList<>());
synchronized (syncList) {              // REQUIRED — iteration is not auto-synchronized
    for (String s : syncList) { ... }
}
```

---

## PART 2: Q&A — BASIC TO ADVANCED

### Basic (0–2 yrs)

**Q1. What is the difference between `Collection` and `Collections`?**
`Collection` is a root interface of the framework (List/Set/Queue extend it). `Collections` is a final utility class with static helper methods (sort, reverse, synchronizedList, etc.). Trap: candidates often confuse these by name alone.

**Q2. Why does `List` allow duplicates but `Set` doesn't?**
By contract/design — `List` models an ordered sequence (like an array), `Set` models a mathematical set. `Set.add()` internally checks `contains()` (via hashCode+equals or compareTo) before inserting and silently returns `false` if a duplicate is found.

**Q3. What's the default initial capacity of `ArrayList` and `HashMap`?**
`ArrayList`: 10 (lazily allocated on first add, Java 8+). `HashMap`: 16 buckets, load factor 0.75.

**Q4. Can a `HashMap` have a null key?**
Yes, exactly one (since only one bucket, index 0, can house it — `hash(null) = 0`). Multiple null *values* are allowed.

**Q5. Difference between `size()` and capacity for `ArrayList`?**
`size()` is the number of actual elements; capacity is the backing array's length (no public `capacity()` method exists on `ArrayList` — this itself is a trap; capacity is only observable indirectly, e.g. via reflection or `ensureCapacity`/`trimToSize` hints).

**Q6. What does `equals()` and `hashCode()` do for a `HashSet`?**
`hashCode()` determines the bucket; `equals()` determines whether an incoming element matches an existing one within that bucket (duplicate detection).

**Q7. What is autoboxing overhead in collections?**
Collections only store objects, not primitives. `List<Integer>` boxes every `int` into an `Integer` object — extra memory (16 bytes header + 4 bytes value, padded) and CPU (boxing/unboxing) versus a primitive array. This is why performance-critical code sometimes uses primitive-specialized structures (e.g. Eclipse Collections' `IntArrayList`, or a raw `int[]`).

**Q8. How do you make a `List` read-only?**
`List.of(...)` (truly immutable, Java 9+) or `Collections.unmodifiableList(list)` (a mutable-underneath view).

**Q9. What's the difference between `poll()` and `remove()` on a `Queue`?**
Both remove and return the head. On an empty queue, `poll()` returns `null`; `remove()` throws `NoSuchElementException`. Same asymmetry exists for `peek()` (returns null) vs `element()` (throws).

**Q10. Why is `String` a popular `HashMap` key?**
Immutable (safe from the mutable-key bug), and `String.hashCode()` is cached (`hash` field computed once, lazily, and reused) — cheap for repeated map operations.

### Intermediate (2–5 yrs)

**Q11. Walk through what happens internally when you call `hashMap.put(key, value)`.**
(See Part 1 §1.4 full internal working — hash spreading, bucket resolution, chain walk/tree walk, insert-or-overwrite, treeify check, resize check.)

**Q12. Why does `HashMap` resize by doubling, and why must capacity be a power of two?**
Doubling keeps amortized insertion cost O(1) (same growth argument as ArrayList). Power-of-two capacity lets the JDK replace the expensive `%` (modulo) operation with a cheap bitwise AND (`hash & (capacity - 1)`) to compute bucket index, and enables the "split into same-index or +oldCapacity" resize optimization (single bit check per entry).

**Q13. What happens if two different objects have the same `hashCode()` but are not `equals()`?**
They land in the same bucket (a **collision**) but remain distinct entries, distinguished during lookup by `equals()`. This is legal and expected — hashCode uniqueness is not required, only that equal objects must share a hashCode.

**Q14. Why is `ConcurrentModificationException` thrown, and is it guaranteed?**
Thrown by fail-fast iterators when `modCount` changes mid-iteration. Explicitly documented as best-effort, NOT a hard guarantee. Should never be used as a correctness mechanism, only as a bug-detection aid during development.

**Q15. Difference between `HashMap` and `Hashtable` beyond synchronization?**
Null handling (HashMap allows 1 null key + null values; Hashtable allows neither), legacy vs modern design, iteration (`Enumeration` vs fail-fast `Iterator`), and performance (Hashtable's whole-object lock vs modern alternatives).

**Q16. Why prefer `ArrayDeque` over `Stack`/`LinkedList` for stack/queue use?**
`Stack extends Vector` — inherits unnecessary synchronization overhead and a poor "is-a Vector" design. `ArrayDeque` is array-backed (better cache locality, no per-element node allocation/GC pressure) and is documented as faster than `Stack` for stack use and faster than `LinkedList` for queue use in most scenarios.

**Q17. What is the load factor and why 0.75?**
Ratio of `size/capacity` that triggers a resize. 0.75 balances time (lookup cost grows with collisions as load factor rises) vs space (wasted, sparsely-filled buckets at low load factor); it's the JDK's documented empirically-tuned default for typical hashCode distributions.

**Q18. How would you iterate and remove elements from a `List` safely?**
Use `Iterator.remove()`, or `list.removeIf(predicate)` (Java 8+), or iterate backwards by index. NOT a for-each with `list.remove(item)` — throws CME (or silently skips elements due to index-shifting, if using naive index-based removal).

**Q19. What's the difference between `Arrays.asList()` and a real `ArrayList`?**
`Arrays.asList()` returns a fixed-size list backed directly by the array — `add()`/`remove()` throw `UnsupportedOperationException`, but `set()` works and mutates the underlying array. `new ArrayList<>(Arrays.asList(...))` is the safe pattern to get a mutable copy.

**Q20. What is `Collections.synchronizedMap()` and what's still unsafe about it?**
Wraps a map so each individual method call is synchronized on a shared lock. Compound operations (check-then-act, like "if absent, put") are still **not atomic** unless you manually synchronize the whole compound block — a common source of race conditions even after "adding synchronization."

### Advanced (5–8 yrs)

**Q21. Explain treeification in `HashMap` — why 8 and why 64?**
When a bucket's chain length reaches 8 (`TREEIFY_THRESHOLD`), AND table capacity is at least 64 (`MIN_TREEIFY_CAPACITY`), that bucket converts to a Red-Black tree, changing worst-case lookup from O(n) to O(log n). The capacity-64 guard exists because at small table sizes, resizing (which naturally redistributes entries) is a cheaper fix than treeifying, so treeification is deferred until the table is large enough that resizing alone won't fix skew. Untreeify happens at 6 entries (hysteresis avoids thrashing at the boundary).

**Q22. Why did Java 8 change bucket insertion from head to tail?**
Java 7's resize logic could create a **circular reference** in a bucket's linked list under concurrent, unsynchronized resizes across multiple threads (a well-known production bug causing CPU spinning at 100% / infinite loop on `get()`). Java 8's tail-insertion plus the internal redesign reduce this blast radius, though `HashMap` is still explicitly not thread-safe — this didn't make concurrent writes to a plain HashMap safe.

**Q23. Deep dive: how does `ConcurrentHashMap.computeIfAbsent` achieve atomicity without locking the whole map?**
It CASes into an empty bucket, or synchronizes only on the first node of the target bucket if occupied — two threads targeting different buckets never contend. While computeIfAbsent for a given key runs, that key's bin is locked — nested/recursive calls into the same map for the same key from within the lambda can deadlock.

**Q24. Why does `TreeMap`/`TreeSet` reject null with natural ordering, but `HashMap` allows null keys?**
`TreeMap` must call `compareTo()` to place the key in the tree — calling a method on `null` fails immediately. `HashMap` doesn't compare the key against anything to find its bucket — `hash(null)` is hardcoded to 0.

**Q25. Java 7 vs Java 8 `HashMap` resize behavior?**
Java 7 recomputes each entry's bucket index from scratch and inserts each at the **head** of the new chain (reverses order — root cause of the infinite-loop bug under concurrent resize). Java 8 exploits power-of-2 capacity: each entry either stays at the same index or moves to `index + oldCapacity`, decided by a single bit test, preserves relative order, and inserts at the tail.

**Q26. How would you design a thread-safe LRU cache from scratch (without `LinkedHashMap`)?**
Combine a `HashMap<K, Node>` for O(1) lookup with a manually maintained doubly-linked list for O(1) reordering on access, guarded by a lock (or `ReentrantReadWriteLock`, or sharded into N independently-locked segments for higher concurrency, similar in spirit to `ConcurrentHashMap`'s historical segment design).

**Q27. Explain weak consistency in `ConcurrentHashMap` iterators with a concrete example.**
```java
ConcurrentHashMap<String,Integer> map = new ConcurrentHashMap<>();
map.put("a", 1);
Iterator<String> it = map.keySet().iterator();
map.put("b", 2);          // modification AFTER iterator created
while (it.hasNext()) System.out.println(it.next());
// May print just "a", or "a" and "b" -- both are valid, no exception either way.
```
The iterator never throws and doesn't guarantee reflecting concurrent modifications made after creation -- a deliberate relaxation versus `HashMap`'s fail-fast contract, made to avoid locking during iteration.

### Expert / Architect Level (8+ yrs)

**Q28. You're designing a shared, high-throughput cache used across 200 threads (mostly reads, some writes). Would you choose `ConcurrentHashMap`, `Collections.synchronizedMap`, or something else, and why?**
`ConcurrentHashMap` -- fine-grained bucket-level locking and lock-free reads scale far better than `synchronizedMap`'s single coarse lock, which serializes every thread regardless of read/write mix. For general K-to-V caching, `ConcurrentHashMap` is the default correct answer, potentially layered with Caffeine/Guava cache for eviction, TTL, and stats that `ConcurrentHashMap` doesn't provide out of the box.

**Q29. What are the memory implications of `HashMap<Long, Long>` for a 50-million-entry in-memory map, and how would you address them?**
Every `Long` key/value is a separate boxed object (the Integer/Long cache only covers -128..127). Each `Node` entry costs roughly: 16 bytes (header) + 4 (hash) + 8 (key ref) + 8 (value ref) + 8 (next ref) ~44+ bytes, plus each boxed Long itself ~24 bytes with padding -- for 50M entries that's several GB of pure overhead beyond the raw data. Mitigation: primitive-specialized maps (Eclipse Collections `LongLongHashMap`, fastutil `Long2LongOpenHashMap`), off-heap structures (Chronicle Map), or reconsidering whether the full dataset needs to be in-memory.

**Q30. A production `HashMap`-based cache shows degraded lookups under load, CPU time in `HashMap.getNode`. Diagnose.**
(a) Poor `hashCode()` distribution causing heavy bucket collisions; (b) mutable key objects mutated post-insertion, causing "lost" entries and repeated linear scans; (c) undersized initial capacity causing repeated resizes under load (check whether `new HashMap<>(expectedSize / 0.75f)` sizing was used); (d) if this is actually concurrent access to a plain (non-concurrent) `HashMap`, you may be hitting structural corruption (a cyclic bucket list) rather than a pure performance issue -- a correctness bug masquerading as slowness, fixed by switching to `ConcurrentHashMap`, not by tuning.

---

## PART 3: SCENARIO-BASED Q&A

**S1 (2–3 yrs). A `for (String s : list) { if (cond) list.remove(s); }` loop throws `ConcurrentModificationException` in production only intermittently, not in dev. Why intermittent, and how do you fix it?**
It's not actually intermittent from CME's perspective -- it will throw whenever a removal happens on any iteration except possibly the second-to-last element (an artifact of how `ArrayList$Itr` checks bounds before checking `modCount` in some code paths, so removing the *last* element sometimes slips through without throwing -- itself a well-known trap that makes people think the bug is "intermittent" when it's actually deterministic given the removed element's position). Fix: `Iterator.remove()`, or `list.removeIf(cond)`.

**S2 (3–4 yrs). A shared `HashMap` used as an in-memory cache across multiple request-handling threads occasionally returns stale or wrong data, and once caused the app to hang at 100% CPU. Diagnose and fix.**
Classic symptom of concurrent mutation of a non-thread-safe `HashMap` -- in Java 7 this specifically manifests as an infinite loop from a corrupted circular bucket-list during concurrent resize; in Java 8 it manifests more often as lost updates or incorrect reads due to un-synchronized structural changes racing. Fix: replace with `ConcurrentHashMap`, or if strict external synchronization is preferred, wrap with `Collections.synchronizedMap` and manually synchronize on it during iteration (though `ConcurrentHashMap` is the standard fix given the concurrency and performance needs implied).

**S3 (4–5 yrs). Your service does `list.contains()` checks in a hot path against a `List` with 500k+ elements, and profiling shows this call dominating CPU. What do you do?**
`List.contains()` is O(n) linear scan regardless of implementation (ArrayList or LinkedList). Swap to a `HashSet`/`HashMap` for O(1) average lookup if order doesn't matter, or `LinkedHashSet` if insertion order must be preserved alongside fast lookup. If the list must stay sorted and range queries matter, a `TreeSet`/binary search on a sorted array (O(log n)) is a middle ground.

**S4 (4–6 yrs). A `LinkedList` was chosen for a queue implementation "because insertion is O(1)," but under load testing it performs worse than an `ArrayDeque`-based version. Why?**
`LinkedList`'s O(1) claim is true for pointer updates but ignores per-node allocation cost, poor CPU cache locality (nodes are scattered on the heap, causing cache misses on traversal, versus `ArrayDeque`'s contiguous backing array), and extra GC pressure from many small node objects. `ArrayDeque` wins in practice for typical queue/stack/deque workloads despite `LinkedList`'s theoretically-appealing Big-O.

**S5 (5–6 yrs). During a load test, `ConcurrentHashMap.size()` returns a value that seems inconsistent with concurrent puts happening at the same instant. Is this a bug?**
No -- `size()` on `ConcurrentHashMap` is a best-effort **approximation** under concurrent modification (it sums striped counters that may be updated concurrently with the read). It's documented as such. If an exact, linearizable count is genuinely required, that requirement itself usually signals a design smell for a highly-concurrent structure -- consider whether the exact instantaneous count is actually needed, or restructure to track it via an explicit atomic counter maintained alongside puts/removes.

**S6 (5–7 yrs). A microservice builds a large `HashMap<String, List<Order>>` at startup by grouping millions of records, and startup time is unacceptably slow, dominated by GC pauses. What would you investigate/change?**
Likely causes: default `HashMap` capacity forcing many resize-and-rehash cycles as the map grows (fix: pre-size with `new HashMap<>(expectedEntries / 0.75f)`); excessive short-lived `List` object churn if using `computeIfAbsent(key, k -> new ArrayList<>())` inefficiently at scale (this itself is fine algorithmically, but check for accidental duplicate work); Eden-space sized too small relative to the burst of allocation causing frequent young-gen GCs (a GC-tuning fix, not a collections fix) -- diagnose with GC logs/JFR to see whether it's allocation-rate-bound or resize-bound before choosing a fix.

**S7 (6–8 yrs). You must choose a data structure for a leaderboard that supports: insert score, update score, and "get top K" efficiently, at scale (millions of entries, frequent updates).**
A `TreeMap<Score, Set<PlayerId>>` (or a `TreeSet<PlayerScore>` with a custom `Comparator`) gives O(log n) insert/update/remove and O(k) "top K" retrieval via `descendingKeySet()`/`headMap()`. Pair with a `HashMap<PlayerId, Score>` for O(1) "what's this player's current score" lookups, updating both structures together on every score change (remove old entry from TreeMap, insert new). At very large scale, this pattern typically moves out of in-process Java collections entirely into Redis Sorted Sets, which solve exactly this problem distributed and persistently.

**S8 (7–8+ yrs, architect level). You're reviewing a teammate's PR that uses `Collections.synchronizedList` wrapping a shared `ArrayList` accessed by 50 worker threads doing frequent reads and occasional writes. What concerns do you raise?**
(a) A single coarse lock serializes ALL access including reads, becoming a severe bottleneck at 50-thread concurrency; (b) iteration still requires manual `synchronized(list)` blocks, easy to forget and a common source of intermittent CME in code review; (c) recommend `CopyOnWriteArrayList` if reads vastly outnumber writes and the list is small/medium, or restructure to a `ConcurrentHashMap`-based structure, or partition work to avoid shared mutable state altogether (often the better architectural fix at that concurrency level) -- also worth asking whether the shared list is even necessary vs. per-thread accumulation with a merge step.

---

## PART 4: TRICKY / TRAP QUESTIONS

**T1.** Does `Collections.unmodifiableList(list)` make the list immutable?
No -- only the *view* is unmodifiable. If you still hold a reference to the original mutable `list` and mutate it directly, those changes are visible through the "unmodifiable" view. True immutability requires `List.of()` or a defensive deep copy.

**T2.** Is `Arrays.asList(1,2,3)` mutable?
Partially -- `set()` works (it mutates the backing array), but `add()`/`remove()` throw `UnsupportedOperationException` because the list is fixed-size by design (backed directly by the array, no resizing possible).

**T3.** Does `PriorityQueue`'s iterator return elements in priority order?
No. Only `poll()`/`peek()` (which access the head) guarantee priority order. Iterating with `for (T t : priorityQueue)` walks the underlying heap array in heap-storage order, not sorted order -- a very commonly missed trap.

**T4.** If two objects are `equals()` but have different `hashCode()`, what breaks?
`HashMap`/`HashSet` may store both as distinct entries even though logically "equal," because they can land in different buckets and never get compared via `equals()` -- silently violating uniqueness expectations. This is a contract violation the JVM does not detect or prevent.

**T5.** Can you store `null` in a `TreeSet`?
No (with natural ordering) -- inserting `null` triggers a `NullPointerException` when `compareTo` is invoked on it. (Note: pre-Java-7 `TreeSet` sometimes let the *first* null slip in as a special case in some JDK versions; the safe, universally-correct interview answer is "no, don't rely on it.")

**T6.** What does `list.remove(1)` do if `list` is a `List<Integer>` -- remove the element `1`, or the element at index `1`?
Overload resolution picks `remove(int index)` when the argument is a primitive `int` literal -- so this removes the element **at index 1**, not the value `1`. To remove the value, you must box it explicitly: `list.remove(Integer.valueOf(1))`. One of the single most common Java gotchas.

**T7.** Is `ConcurrentHashMap` fully immune to race conditions in application code that uses it?
No. `ConcurrentHashMap` makes individual operations thread-safe, but **compound** operations built from multiple calls (e.g., `if (!map.containsKey(k)) map.put(k, v);`) are still race-prone unless you use the atomic compound methods (`putIfAbsent`, `computeIfAbsent`, `merge`, `compute`).

**T8.** Does `HashSet` guarantee element order matches insertion order?
No -- explicitly undefined/no guarantee (order is a function of hashCode and bucket layout, and can change across JVM versions or even across resizes of the same set at runtime). Use `LinkedHashSet` if insertion order matters.

**T9.** Will `map.get(key)` returning `null` always mean the key isn't present?
Not necessarily for `HashMap` -- the key could be present with an explicitly stored `null` value. Use `map.containsKey(key)` to disambiguate, or (Java 8+) `map.getOrDefault(key, sentinel)`. For `ConcurrentHashMap`, this ambiguity doesn't exist because null values are disallowed entirely.

**T10.** Are `String` keys in a `HashMap` always safe from the "mutable key" bug?
Yes -- `String` is immutable and its `hashCode()` is cached, so this specific bug class can't occur with String keys. The bug applies to custom mutable objects used as keys.

---

## PART 5: PROGRAMMING / CODING QUESTIONS

**P1. Implement a simple LRU cache using `LinkedHashMap` (O(1) get/put).**
```java
class LRUCache<K, V> extends LinkedHashMap<K, V> {
    private final int capacity;
    public LRUCache(int capacity) {
        super(16, 0.75f, true);   // access-order = true
        this.capacity = capacity;
    }
    @Override
    protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
        return size() > capacity;
    }
}
```
Complexity: O(1) get/put (amortized). Common mistake: forgetting `accessOrder=true`, which silently degrades this to insertion-order (FIFO) eviction instead of true LRU.

**P2. Find the first non-repeating character in a string using a `Map`.**
```java
static Character firstNonRepeating(String s) {
    Map<Character, Integer> counts = new LinkedHashMap<>();  // preserve first-seen order
    for (char c : s.toCharArray()) counts.merge(c, 1, Integer::sum);
    for (Map.Entry<Character, Integer> e : counts.entrySet())
        if (e.getValue() == 1) return e.getKey();
    return null;
}
```
Complexity: O(n) time, O(k) space (k = distinct chars). Common mistake: using `HashMap` instead of `LinkedHashMap`, which loses "first" ordering and can return the wrong character.

**P3. Given two lists, find the intersection efficiently.**
```java
static <T> Set<T> intersection(List<T> a, List<T> b) {
    Set<T> setA = new HashSet<>(a);
    Set<T> result = new HashSet<>();
    for (T item : b) if (setA.contains(item)) result.add(item);
    return result;
}
```
Complexity: O(n + m). Common mistake: nested loops (`for a: for b:`) giving O(n*m) -- a frequent naive-first-attempt in interviews; always mention the Set-based optimization proactively.

**P4. Detect if a `List` contains a duplicate in O(n).**
```java
static boolean hasDuplicate(List<Integer> list) {
    Set<Integer> seen = new HashSet<>();
    for (int x : list) if (!seen.add(x)) return true;   // add() returns false if already present
    return false;
}
```
Elegant trick interviewers look for: using `Set.add()`'s boolean return value instead of a separate `contains()` check (avoids double hashing/lookup).

**P5. Group a list of `Employee` objects by department, then by salary band, using Java 8 Streams + Collectors (tests Collections + Streams integration).**
```java
Map<String, Map<String, List<Employee>>> grouped = employees.stream()
    .collect(Collectors.groupingBy(Employee::getDept,
             Collectors.groupingBy(e -> e.getSalary() > 100_000 ? "high" : "standard")));
```
Common mistake: not realizing `groupingBy` defaults to a `HashMap` (unordered) -- if department order matters, pass a `TreeMap::new` supplier as a third argument to the outer `groupingBy`.

**P6. Implement a bounded thread-safe cache with simple eviction using only `java.util.concurrent` primitives (no external library).**
```java
class BoundedCache<K, V> {
    private final int capacity;
    private final ConcurrentHashMap<K, V> map = new ConcurrentHashMap<>();
    private final ConcurrentLinkedQueue<K> order = new ConcurrentLinkedQueue<>();

    BoundedCache(int capacity) { this.capacity = capacity; }

    V get(K key) { return map.get(key); }

    void put(K key, V value) {
        if (map.putIfAbsent(key, value) == null) {
            order.add(key);
            while (order.size() > capacity) {
                K evict = order.poll();
                if (evict != null) map.remove(evict, map.get(evict));
            }
        } else {
            map.put(key, value);
        }
    }
}
```
This is intentionally FIFO, not true LRU (true concurrent LRU needs more care -- worth discussing `Caffeine`'s approach as the production-grade answer). Common mistake: candidates reach for `synchronized` blocks around a plain `HashMap` first -- acceptable for correctness, but interviewers at this level want to see awareness of lock-free/fine-grained alternatives.

**P7. Given a stream of numbers, maintain a running top-K largest values efficiently.**
```java
static List<Integer> topK(int[] nums, int k) {
    PriorityQueue<Integer> minHeap = new PriorityQueue<>(k);   // min-heap of size k
    for (int n : nums) {
        minHeap.offer(n);
        if (minHeap.size() > k) minHeap.poll();   // evict smallest
    }
    return new ArrayList<>(minHeap);
}
```
Complexity: O(n log k) -- much better than sorting the whole array (O(n log n)) when k is small. Common mistake: using a max-heap of all elements, which loses the efficiency win.

---

## PART 6: DEBUGGING DETAILS

**Common collection-related production symptoms and how to debug them:**

- **`ConcurrentModificationException` in logs**: Search the stack trace for the exact iterator-producing collection type. Grep the surrounding code for any mutation of that collection during iteration (including indirect mutation via a method call passed the same collection reference). Fix with `Iterator.remove()`, `removeIf()`, or switching to a concurrent-safe structure if the mutation is genuinely from another thread.

- **CPU pegged at 100%, thread dump shows threads stuck in `HashMap.get()`/`transfer()`/`resize()`**: Classic signature of concurrent unsynchronized mutation of a plain `HashMap` corrupting its internal bucket linked list into a cycle. Take a **thread dump** (`jstack <pid>`) -- look for multiple threads with stack frames inside `HashMap` internals, none making progress across repeated dumps taken a few seconds apart. Fix: `ConcurrentHashMap`.

- **`NullPointerException` inside `TreeMap`/`TreeSet` operations**: Almost always a `null` key/element with natural ordering, or a `Comparator` that doesn't defensively null-check. Check the stack trace frame -- if it's inside `compareTo`/`compare` itself, confirm which argument was null.

- **"Element not found" bugs / `map.get(key)` returns `null` unexpectedly for a key you're sure you `put()`**: Check whether the key type is mutable and whether any field used in its `hashCode()`/`equals()` was changed after insertion. Reproduce by printing `key.hashCode()` at insertion time and at lookup time -- if they differ, that's the bug.

- **`OutOfMemoryError` traced to large collections**: Use a heap dump (`jmap -dump:live,format=b,file=heap.hprof <pid>` or triggered automatically via `-XX:+HeapDumpOnOutOfMemoryError`) and analyze with **Eclipse MAT** or **VisualVM** -- look at the dominator tree / "leak suspects" report; commonly a `HashMap`/`List` acting as an unbounded cache with no eviction, or a listener/registration list where entries are added but never removed (a classic memory leak pattern -- registering listeners without a matching unregister on component teardown).

- **`Arrays.asList()`/immutable-list `UnsupportedOperationException` in production but not caught in tests**: Trace back to where the list was constructed -- often several layers up, a helper method silently switched from returning a mutable `ArrayList` to `List.of()`/`Arrays.asList()` during a refactor, and a caller several calls away tries to mutate it. IDE "find usages" on the construction site plus reading the actual returned type (not just the declared `List` interface type) is the fastest way to trace this.

- **Debugging tools for collections specifically**:
  - IDE conditional breakpoints on `size() > threshold` to catch runaway growth.
  - `jconsole`/`VisualVM` heap histograms (`jmap -histo:live <pid>`) to see instance counts of `HashMap$Node`, `ArrayList`, etc. -- a huge count relative to expectation points at a leak or unexpected duplication.
  - Reflection-based inspection of `HashMap` internals (`table.length`, bucket depth distribution) is possible in a debugger/scratch script when diagnosing collision-heavy hashCode implementations, though this is JDK-internals-dependent and mainly a diagnostic last resort, not production code.

---

## PART 7: MONITORING

- **JFR (Java Flight Recorder)**: Enable with `-XX:+FlightRecorder -XX:StartFlightRecording=filename=recording.jfr`. Look at the "Object Allocation" and "Old Object Sample" event types to catch excessive collection growth/churn, and "Contended Lock" events to catch heavy contention on `synchronizedMap`/`Hashtable`-style coarse locks.
- **VisualVM / JConsole**: Live heap histogram to watch `HashMap$Node[]`, `ArrayList$Object[]`, and boxed types (`Long`, `Integer`) instance counts over time -- steadily climbing counts with no plateau indicate a leak.
- **GC logs** (`-Xlog:gc*` on Java 9+, or `-verbose:gc -XX:+PrintGCDetails` on Java 8): Frequent young-gen collections correlating with bulk collection operations (e.g., large `HashMap` resizes, big `ArrayList` copies) point at allocation-rate problems traceable to collection usage patterns.
- **APM tools (Prometheus/Grafana, Datadog, New Relic)**: Export custom gauges for cache/collection sizes (`Gauge.set(cache.size())`) so growth trends are visible on dashboards rather than only discovered during an incident. For `ConcurrentHashMap`-based caches, also track hit/miss ratio if used as a cache (not built-in -- requires wrapping with counters, or using Caffeine, which exposes this natively via `CacheStats`).
- **Thread dumps** (`jstack`, or `kill -3 <pid>` for stdout dump): The primary tool for diagnosing concurrent-collection contention or corruption -- take 3-5 dumps a few seconds apart during an incident and diff them; threads stuck at the same stack frame across all dumps indicate a stall/deadlock/infinite loop rather than normal contention.
- **"Healthy vs unhealthy" heuristics**: A `HashMap`-backed cache holding a *bounded, expected* number of entries with a stable size over time = healthy. Unbounded, monotonically growing size with no corresponding business growth = leak. High CPU time in `hashCode()`/`equals()` relative to total request time on a profiler flame graph = expensive key type, worth optimizing (e.g., caching a computed hashCode, as `String` does).

---

## PART 8: PERFORMANCE -- ISSUES & IMPROVEMENTS

| Issue | Root Cause | Fix |
|---|---|---|
| Slow `List.contains()` in a hot path | O(n) linear scan | Switch to `HashSet`/`HashMap` for O(1) average lookup |
| Frequent `HashMap` resizes during bulk load | Default capacity too small for known final size | Pre-size: `new HashMap<>((int)(expectedSize / 0.75f) + 1)` |
| High GC pressure from `LinkedList` usage | Per-node object allocation, poor cache locality | Prefer `ArrayDeque`/`ArrayList` unless O(1) mid-list insert/delete is genuinely needed |
| Contention on `synchronizedMap`/`Hashtable` under high concurrency | Single coarse-grained lock serializes all access | `ConcurrentHashMap` (fine-grained/lock-free reads) |
| Boxing overhead in numeric-heavy collections | `List<Integer>`/`Map<Integer,Integer>` box every primitive | Use primitive-specialized libraries (Eclipse Collections, fastutil, Trove) for very large numeric collections |
| Worst-case O(n) `HashMap` lookups under adversarial/skewed keys | Poor `hashCode()` distribution, or deliberate collision attack on a public-facing map | Java 8+ auto-treeification mitigates this (O(log n) worst case); also review custom `hashCode()` implementations for quality (avoid constant or narrow-range hashCodes) |
| Slow iteration + removal pattern | Naive nested loop or repeated `list.remove(item)` (O(n) shift each time) inside another O(n) loop = O(n^2) | `removeIf()` (single O(n) pass), or build a new filtered collection instead of removing in place |
| Large `ArrayList` copy costs during growth spikes | Repeated array doubling during a burst of adds without pre-sizing | `new ArrayList<>(expectedSize)` constructor, or `ensureCapacity()` up front |
| `TreeMap`/`TreeSet` slower than expected | O(log n) tree operations plus `Comparator` call overhead on every comparison, especially with an expensive custom `compareTo` | Cache/pre-compute comparison keys where possible; consider whether sorted order is truly needed vs. sorting once at the end |
| `ConcurrentHashMap.size()` called frequently in a hot loop | Involves summing striped counters -- cheap but not free, and often called far more than needed (e.g., in a loop condition) | Cache the size locally once per operation instead of re-querying repeatedly |

**Benchmark intuition (order-of-magnitude, not exact numbers -- always mention JMH for real benchmarking, never trust microbenchmarks without warmup):**
- `HashMap.get()` average case: single-digit nanoseconds once JIT-warmed, dominated by `hashCode()`/`equals()` cost of the key type more than the map itself.
- `ArrayList.get(index)`: effectively free (array index + bounds check), sub-nanosecond after JIT inlining.
- `LinkedList.get(index)` at n=100,000, index near the middle: orders of magnitude slower than `ArrayList.get()` due to O(n) pointer-chasing plus cache misses.
- Always benchmark with **JMH** (Java Microbenchmark Harness), never with naive `System.currentTimeMillis()` loops -- JIT warmup, dead-code elimination, and constant folding routinely produce misleading naive-benchmark numbers.

---

## PART 9: BEST PRACTICES & ANTI-PATTERNS

**Do:**
- Code to the interface (`List`, `Map`, `Set`) not the implementation, for flexibility and testability.
- Pre-size collections when the final size is known or estimable, to avoid resize churn.
- Prefer immutable collections (`List.of()`, etc.) for data that shouldn't change, both for safety and for signaling intent to future readers.
- Use `ConcurrentHashMap`/other `java.util.concurrent` structures for genuinely concurrent access, rather than retrofitting synchronization onto a plain collection.
- Override `equals()`/`hashCode()` together, always, and make hashCode based only on immutable fields if the object will be used as a map key or set element.
- Use `EnumSet`/`EnumMap` for enum-keyed collections -- faster and more memory-efficient than `HashSet`/`HashMap` equivalents.

**Don't:**
- Don't use a mutable object as a `HashMap` key/`HashSet` element if any field contributing to `hashCode()` can change after insertion.
- Don't rely on `HashSet`/`HashMap` iteration order -- it's unspecified and can silently change across JDK versions.
- Don't assume `Collections.synchronizedX()` makes compound operations (check-then-act) atomic -- it only guarantees individual method calls are synchronized.
- Don't use `Vector`/`Stack`/`Hashtable` in new code -- legacy, generally superseded by modern alternatives (`ArrayList`/`ArrayDeque`/`ConcurrentHashMap`).
- Don't call `list.remove(int)` when you mean to remove an `Integer` value -- box explicitly (`Integer.valueOf(x)`) to avoid the overload-resolution trap.
- Don't treat `ConcurrentModificationException` avoidance as a proof of thread-safety -- CME detection is single-threaded, best-effort bookkeeping, not a concurrency guarantee.

---

## PART 10: QUICK-REFERENCE / CHEAT SHEET

**Complexity cheat sheet:**

| Structure | get/contains | add | remove | notes |
|---|---|---|---|---|
| ArrayList | O(1) | O(1) amortized (end), O(n) (middle) | O(n) | contiguous array |
| LinkedList | O(n) | O(1) (ends) | O(1) once positioned | node-based, high overhead |
| HashMap/HashSet | O(1) avg, O(log n) worst (treeified) | O(1) avg | O(1) avg | needs good hashCode() |
| LinkedHashMap/Set | O(1) avg | O(1) avg | O(1) avg | + insertion/access order |
| TreeMap/TreeSet | O(log n) | O(log n) | O(log n) | sorted, Red-Black tree |
| ConcurrentHashMap | O(1) avg, lock-free reads | O(1) avg | O(1) avg | thread-safe, no nulls |
| ArrayDeque | O(1) (ends) | O(1) (ends) | O(1) (ends) | preferred stack/queue |
| PriorityQueue | O(1) peek | O(log n) | O(log n) | binary heap, not sorted iteration |

**One-line "why" answers for rapid recall:**
- Power-of-2 capacity in HashMap → enables bitwise AND instead of modulo, and cheap resize-split.
- Load factor 0.75 → time/space tradeoff, empirically tuned default.
- Treeify at 8/untreeify at 6 → O(log n) worst case protection against hash-collision DoS; hysteresis gap avoids thrashing.
- ConcurrentHashMap disallows null → removes ambiguity between "absent" and "mapped to null" in concurrent reads.
- Map doesn't extend Collection → key-value pair semantics don't fit single-element Collection contract.
- TreeSet/TreeMap use compareTo, not equals, for uniqueness → compareTo==0 elements are treated as duplicates even if unequal.
- Arrays.asList() is fixed-size → backed directly by the array, `add`/`remove` unsupported, `set` mutates the array.
- Java 7→8 tail-insertion + resize redesign → fixed the classic concurrent-resize infinite loop bug (though HashMap remains not thread-safe).

**Last-minute revision list -- be ready to explain out loud, unprompted:**
1. HashMap.put() full internal flow, start to finish.
2. HashMap vs ConcurrentHashMap vs Hashtable vs synchronizedMap -- all four, precisely.
3. The mutable-key bug -- reproduce it live if asked to code.
4. Arrays.asList() trap and list.remove(int) overload trap.
5. Fail-fast vs fail-safe iterators, and why CME is best-effort not guaranteed.
6. When to reach for ArrayDeque vs LinkedList vs ArrayList vs Vector -- and why the legacy ones are legacy.
7. LRU cache implementation via LinkedHashMap, cold.
8. Treeification thresholds and the reasoning behind 8/64/6.
