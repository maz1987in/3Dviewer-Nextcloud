# Shared Annotations and Measurements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-user private annotation storage with one shared set of annotations and measurements per model. Everyone who can open the model can see it, including through a public link, and everyone who can edit the model can change it.

**Architecture:** A new `threedviewer_notes` table holds one row per note, keyed by the model's file ID. `NotesService` owns validation, limits and the one-time legacy migration. `NoteAccess` works out read access and edit rights from the model file itself on every request. `NotesController` serves signed-in users, and `PublicNotesController` (extending `PublicShareController`) serves public links, read-only. In the browser, `useSharedNotes` does all the server traffic. `useAnnotation` and `useMeasurement` keep drawing and editing, and report adds, edits and deletes through hooks.

**Tech Stack:** PHP 8.1+ on the Nextcloud AppFramework (NC 31–34), `QBMapper` and migrations, PHPUnit (unit, integration, and a new HTTP suite), Vue 3 composables, three.js r186, `@nextcloud/axios`, Jest 30 with Babel 8, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-28-shared-notes-design.md`

## Global Constraints

- Nextcloud `min-version="31"` / `max-version="34"` (from `appinfo/info.xml`); use only `OCP\` APIs in `lib/`. `tests/unit/NoPrivateServerApiTest.php` enforces this.
- Table name `threedviewer_notes`; columns `id`, `file_id`, `type`, `payload`, `author_uid`, `created_at`, `updated_at`.
- Note types are exactly `annotation` and `measurement`.
- Annotation payload: `{ "space": "model", "point": {x,y,z}, "text": string }`. Measurement payload: `{ "space": "model", "points": [{x,y,z}, {x,y,z}] }`.
- `space` is `"model"` for every note the API accepts. `"scene"` is written only by the legacy migration.
- Annotation text: at most 2,000 characters. Whole stored payload: at most 10 KB (10,240 bytes) of JSON.
- At most 1,000 notes per model.
- Unknown payload keys are rejected, and coordinates must be finite numbers.
- Signed-in routes: none carries `#[NoCSRFRequired]`, and that includes `GET`, because it runs the migration. The public route keeps `#[PublicPage]` and `#[NoCSRFRequired]`.
- Inaccessible file: `404`. Read-only user writing: `403`. Invalid payload: `400`. Note limit reached: `409`.
- Public responses carry `author: null` on every note.
- Text edits are saved 600 ms after typing stops (`TEXT_SAVE_DEBOUNCE_MS = 600`).
- A save that fails leaves Retry (and, for never-saved notes, Discard) buttons on the note's panel entry, plus a plain toast.
- User-facing strings go through `t('threedviewer', …)`.
- Commit messages follow Conventional Commits (CI lints them). Never add a `Co-Authored-By` trailer. CHANGELOG entries go under `## [Unreleased]`.
- Do not push; the maintainer pushes.

## Review Focus

These five failure modes follow from the spec but aren't obviously covered by any task. Each has a test in the task named after it.

1. **Switching to another model in the same viewer must not delete notes on the server.** Clearing the old model's notes locally has to be silent. (Task 10: `load() clears previous notes silently`; Task 11: silent clear tests.)
2. **Deleting a note while its first save is still in flight must not leave an orphan on the server.** (Task 10: `delete during save removes the note once the server answers`.)
3. **A 2,000-character note in emoji or CJK text must save.** (Task 2: `testMaxLengthEmojiTextFitsTheByteCap`.)
4. **Two tabs opening the same model at once must not migrate legacy annotations twice.** (Task 4: the lock is held and the document re-read; Task 7: `testParallelFirstOpensMigrateOnce`.)
5. **A note typed before its first save finishes must not lose that text.** (Task 10: `text typed during the first save is sent afterwards`.)

---

## File Structure

**Create (server)**
- `lib/Migration/Version030600Date20260928000000.php`: creates `threedviewer_notes`.
- `lib/Db/Note.php`, `lib/Db/NoteMapper.php`: entity and queries, including orphan cleanup.
- `lib/Service/Exception/InvalidNoteException.php`, `lib/Service/Exception/NoteLimitException.php`
- `lib/Service/NotePayload.php`: pure payload validation.
- `lib/Service/NoteAccessResult.php`, `lib/Service/NoteAccess.php`: read and edit rights from the model file.
- `lib/Service/NotesService.php`: CRUD, limits, serialization, legacy migration.
- `lib/Controller/NotesController.php`: signed-in API.
- `lib/Controller/PublicNotesController.php`: read-only public API.
- `lib/Cron/CleanupOrphanNotes.php`: daily orphan cleanup.

**Create (tests)**
- `tests/unit/Migration/Version030600Date20260928000000Test.php`
- `tests/unit/Service/NotePayloadTest.php`, `tests/unit/Service/NoteAccessTest.php`, `tests/unit/Service/NotesServiceTest.php`
- `tests/unit/Controller/NotesControllerTest.php`, `tests/unit/Controller/PublicNotesControllerTest.php`
- `tests/integration/NoteMapperTest.php`
- `tests/phpunit.http.xml`, `tests/http/HttpTestCase.php`, `tests/http/NotesHttpTest.php`
- `tests/unit/utils/noteSpace.test.js`, `tests/unit/utils/notesApi.test.js`
- `tests/unit/composables/useSharedNotes.test.js`, `tests/unit/composables/noteHooks.test.js`
- `tests/playwright/shared-notes.spec.ts`

**Create (frontend)**
- `src/utils/noteSpace.js`: conversion between scene and model coordinates.
- `src/utils/notesApi.js`: HTTP client for both routes.
- `src/composables/useSharedNotes.js`: sync logic.

**Modify**
- `lib/Service/AnnotationsService.php`: drop `save()`; now read and delete only, for the migration.
- Delete `lib/Controller/AnnotationsController.php`.
- `appinfo/info.xml`: register the background job.
- `composer.json`: add a `test:http` script.
- `.github/workflows/test-integration.yml`: start a PHP web server and run `test:http`.
- `openapi.json`: regenerate.
- `src/composables/useAnnotation.js`, `src/composables/useMeasurement.js`: hooks, silent variants, `setCanAdd`; remove backend persistence.
- `src/components/ThreeViewer.vue`: wiring, panel UI, export and import, removal of the autosave watcher.
- `CHANGELOG.md`

---

### Task 1: Notes table, entity and mapper

**Files:**
- Create: `lib/Migration/Version030600Date20260928000000.php`
- Create: `lib/Db/Note.php`
- Create: `lib/Db/NoteMapper.php`
- Test: `tests/unit/Migration/Version030600Date20260928000000Test.php`
- Test: `tests/integration/NoteMapperTest.php`

**Interfaces:**
- Produces: `OCA\ThreeDViewer\Db\Note` with magic accessors `getFileId(): int`, `getType(): string`, `getPayload(): string`, `getAuthorUid(): string`, `getCreatedAt(): int`, `getUpdatedAt(): int` (and matching setters), plus `getId(): int`.
- Produces: `NoteMapper::findByFile(int $fileId): Note[]` (ordered by `id` ascending), `NoteMapper::findInFile(int $fileId, int $noteId): Note` (throws `OCP\AppFramework\Db\DoesNotExistException`), `NoteMapper::countByFile(int $fileId): int`, `NoteMapper::deleteOrphans(): int`, and the inherited `insert(Note): Note`, `update(Note): Note`, `delete(Note): Note`.

- [ ] **Step 1: Write the failing migration unit test**

`tests/unit/Migration/Version030600Date20260928000000Test.php`:

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Migration;

use OCA\ThreeDViewer\Migration\Version030600Date20260928000000;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use PHPUnit\Framework\TestCase;

/**
 * The migration that creates the shared notes table.
 */
class Version030600Date20260928000000Test extends TestCase
{
    public function testCreatesTheNotesTableWithItsColumnsAndFileIndex(): void
    {
        $recorded = ['columns' => [], 'indexes' => [], 'primary' => []];

        $table = $this->getMockBuilder(\stdClass::class)
            ->addMethods(['addColumn', 'setPrimaryKey', 'addIndex'])
            ->getMock();
        $table->method('addColumn')->willReturnCallback(
            function (string $name, string $type, array $spec = []) use (&$recorded) {
                $recorded['columns'][$name] = ['type' => $type, 'spec' => $spec];
            }
        );
        $table->method('setPrimaryKey')->willReturnCallback(
            function (array $columns) use (&$recorded) {
                $recorded['primary'] = $columns;
            }
        );
        $table->method('addIndex')->willReturnCallback(
            function (array $columns, string $name) use (&$recorded) {
                $recorded['indexes'][$name] = $columns;
            }
        );

        $schema = $this->createMock(ISchemaWrapper::class);
        $schema->method('hasTable')->with('threedviewer_notes')->willReturn(false);
        $schema->expects($this->once())->method('createTable')->with('threedviewer_notes')->willReturn($table);

        (new Version030600Date20260928000000())->changeSchema(
            $this->createMock(IOutput::class),
            fn () => $schema,
            []
        );

        $this->assertSame(
            ['id', 'file_id', 'type', 'payload', 'author_uid', 'created_at', 'updated_at'],
            array_keys($recorded['columns'])
        );
        $this->assertSame(Types::BIGINT, $recorded['columns']['file_id']['type']);
        $this->assertSame(Types::TEXT, $recorded['columns']['payload']['type']);
        $this->assertSame(16, $recorded['columns']['type']['spec']['length']);
        $this->assertSame(64, $recorded['columns']['author_uid']['spec']['length']);
        $this->assertSame(['id'], $recorded['primary']);
        $this->assertSame(['file_id'], $recorded['indexes']['tdv_notes_file']);
    }

    public function testLeavesAnExistingTableAlone(): void
    {
        $schema = $this->createMock(ISchemaWrapper::class);
        $schema->method('hasTable')->with('threedviewer_notes')->willReturn(true);
        $schema->expects($this->never())->method('createTable');

        (new Version030600Date20260928000000())->changeSchema(
            $this->createMock(IOutput::class),
            fn () => $schema,
            []
        );
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `composer test:unit -- --filter Version030600`
Expected: FAIL with `Class "OCA\ThreeDViewer\Migration\Version030600Date20260928000000" not found`.

- [ ] **Step 3: Write the migration**

`lib/Migration/Version030600Date20260928000000.php`:

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Creates the shared notes table: one row per annotation or measurement, keyed by the
 * model's file id so a note follows the model through moves and renames.
 */
class Version030600Date20260928000000 extends SimpleMigrationStep
{
    /**
     * @param Closure $schemaClosure The `\Closure` returns a `ISchemaWrapper`
     * @return null|ISchemaWrapper
     */
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options)
    {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if ($schema->hasTable('threedviewer_notes')) {
            return $schema;
        }

        $table = $schema->createTable('threedviewer_notes');
        $table->addColumn('id', Types::BIGINT, ['autoincrement' => true, 'notnull' => true]);
        $table->addColumn('file_id', Types::BIGINT, ['notnull' => true]);
        $table->addColumn('type', Types::STRING, ['notnull' => true, 'length' => 16]);
        $table->addColumn('payload', Types::TEXT, ['notnull' => true]);
        $table->addColumn('author_uid', Types::STRING, ['notnull' => true, 'length' => 64]);
        $table->addColumn('created_at', Types::BIGINT, ['notnull' => true]);
        $table->addColumn('updated_at', Types::BIGINT, ['notnull' => true]);
        $table->setPrimaryKey(['id']);
        $table->addIndex(['file_id'], 'tdv_notes_file');

        return $schema;
    }
}
```

- [ ] **Step 4: Run the migration test to verify it passes**

Run: `composer test:unit -- --filter Version030600`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the entity and mapper**

`lib/Db/Note.php`:

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Db;

use OCP\AppFramework\Db\Entity;

/**
 * One shared annotation or measurement on a model.
 *
 * `payload` is the validated JSON document (see NotePayload); it is stored as text and
 * decoded by NotesService, never by callers.
 *
 * @method int getFileId()
 * @method void setFileId(int $fileId)
 * @method string getType()
 * @method void setType(string $type)
 * @method string getPayload()
 * @method void setPayload(string $payload)
 * @method string getAuthorUid()
 * @method void setAuthorUid(string $authorUid)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $createdAt)
 * @method int getUpdatedAt()
 * @method void setUpdatedAt(int $updatedAt)
 */
class Note extends Entity
{
    protected $fileId;
    protected $type;
    protected $payload;
    protected $authorUid;
    protected $createdAt;
    protected $updatedAt;

    public function __construct()
    {
        $this->addType('fileId', 'integer');
        $this->addType('type', 'string');
        $this->addType('payload', 'string');
        $this->addType('authorUid', 'string');
        $this->addType('createdAt', 'integer');
        $this->addType('updatedAt', 'integer');
    }
}
```

`lib/Db/NoteMapper.php`:

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/**
 * @template-extends QBMapper<Note>
 */
class NoteMapper extends QBMapper
{
    /** Keeps each IN (...) list well under every database's parameter limit. */
    private const DELETE_CHUNK = 500;

    public function __construct(IDBConnection $db)
    {
        parent::__construct($db, 'threedviewer_notes', Note::class);
    }

    /**
     * @return Note[] oldest first, so notes keep the order they were made in
     */
    public function findByFile(int $fileId): array
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('file_id', $qb->createNamedParameter($fileId, IQueryBuilder::PARAM_INT)))
            ->orderBy('id', 'ASC');

        return $this->findEntities($qb);
    }

    /**
     * A note, but only if it belongs to the given model. Scoping by file id is what stops
     * a caller with edit rights on one model from reaching notes on another.
     *
     * @throws DoesNotExistException
     */
    public function findInFile(int $fileId, int $noteId): Note
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($noteId, IQueryBuilder::PARAM_INT)))
            ->andWhere($qb->expr()->eq('file_id', $qb->createNamedParameter($fileId, IQueryBuilder::PARAM_INT)));

        return $this->findEntity($qb);
    }

    public function countByFile(int $fileId): int
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select($qb->func()->count('*', 'n'))
            ->from($this->getTableName())
            ->where($qb->expr()->eq('file_id', $qb->createNamedParameter($fileId, IQueryBuilder::PARAM_INT)));

        $result = $qb->executeQuery();
        $count = (int) $result->fetchOne();
        $result->closeCursor();

        return $count;
    }

    /**
     * Delete notes whose model no longer exists anywhere.
     *
     * A file in the trash keeps its filecache row, so a model restored from the trash
     * comes back with its notes; only a permanently deleted model loses them.
     *
     * @return int number of notes deleted
     */
    public function deleteOrphans(): int
    {
        $qb = $this->db->getQueryBuilder();
        $qb->selectDistinct('n.file_id')
            ->from($this->getTableName(), 'n')
            ->leftJoin('n', 'filecache', 'f', $qb->expr()->eq('n.file_id', 'f.fileid'))
            ->where($qb->expr()->isNull('f.fileid'));

        $result = $qb->executeQuery();
        $orphanFileIds = [];
        while (($fileId = $result->fetchOne()) !== false) {
            $orphanFileIds[] = (int) $fileId;
        }
        $result->closeCursor();

        $deleted = 0;
        foreach (array_chunk($orphanFileIds, self::DELETE_CHUNK) as $chunk) {
            $delete = $this->db->getQueryBuilder();
            $delete->delete($this->getTableName())
                ->where($delete->expr()->in('file_id', $delete->createNamedParameter($chunk, IQueryBuilder::PARAM_INT_ARRAY)));
            $deleted += $delete->executeStatement();
        }

        return $deleted;
    }
}
```

- [ ] **Step 6: Write the integration test for the mapper**

`tests/integration/NoteMapperTest.php`:

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Integration;

use OCA\ThreeDViewer\Db\Note;
use OCA\ThreeDViewer\Db\NoteMapper;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\Files\IRootFolder;
use OCP\IUserManager;
use OCP\Server;
use PHPUnit\Framework\TestCase;

/**
 * NoteMapper against the real database — SQLite, MySQL and Postgres in CI.
 */
class NoteMapperTest extends TestCase
{
    private const PASSWORD = 'integration-suite-password-Aa1!';

    /** A file id no filecache row will ever have. */
    private const MISSING_FILE_ID = 2_000_000_000;

    private NoteMapper $mapper;

    private string $uid;

    private int $fileId;

    protected function setUp(): void
    {
        $this->mapper = Server::get(NoteMapper::class);
        $this->uid = 'tdv-it-' . bin2hex(random_bytes(6));
        Server::get(IUserManager::class)->createUser($this->uid, self::PASSWORD);
        $home = Server::get(IRootFolder::class)->getUserFolder($this->uid);
        $this->fileId = $home->newFile('model.stl', 'solid x')->getId();
    }

    protected function tearDown(): void
    {
        foreach ([$this->fileId, self::MISSING_FILE_ID] as $fileId) {
            foreach ($this->mapper->findByFile($fileId) as $note) {
                $this->mapper->delete($note);
            }
        }
        Server::get(IUserManager::class)->get($this->uid)?->delete();
    }

    public function testFindsNotesOfOneFileOldestFirst(): void
    {
        $first = $this->insert($this->fileId, 'first');
        $second = $this->insert($this->fileId, 'second');
        $this->insert(self::MISSING_FILE_ID, 'elsewhere');

        $ids = array_map(fn (Note $n) => $n->getId(), $this->mapper->findByFile($this->fileId));

        $this->assertSame([$first->getId(), $second->getId()], $ids);
        $this->assertSame(2, $this->mapper->countByFile($this->fileId));
    }

    public function testFindInFileRefusesANoteFromAnotherFile(): void
    {
        $note = $this->insert(self::MISSING_FILE_ID, 'elsewhere');

        $this->expectException(DoesNotExistException::class);
        $this->mapper->findInFile($this->fileId, $note->getId());
    }

    public function testDeleteOrphansKeepsNotesOfExistingFiles(): void
    {
        $kept = $this->insert($this->fileId, 'kept');
        $this->insert(self::MISSING_FILE_ID, 'orphan');

        $deleted = $this->mapper->deleteOrphans();

        $this->assertGreaterThanOrEqual(1, $deleted);
        $this->assertSame([], $this->mapper->findByFile(self::MISSING_FILE_ID));
        $this->assertSame($kept->getId(), $this->mapper->findInFile($this->fileId, $kept->getId())->getId());
    }

    private function insert(int $fileId, string $text): Note
    {
        $note = new Note();
        $note->setFileId($fileId);
        $note->setType('annotation');
        $note->setPayload(json_encode(['space' => 'model', 'point' => ['x' => 0.0, 'y' => 0.0, 'z' => 0.0], 'text' => $text]));
        $note->setAuthorUid($this->uid);
        $note->setCreatedAt(time());
        $note->setUpdatedAt(time());

        return $this->mapper->insert($note);
    }
}
```

- [ ] **Step 7: Run the unit suite and lint**

Run: `composer test:unit && composer lint && composer cs:fix`
Expected: all green. The integration suite needs a server: run it in the dev container (see the memory note on the dev container workflow, which requires re-enabling the app) or rely on CI. The migration only runs on an app version bump, so in the dev container run `php occ migrations:execute threedviewer 030600Date20260928000000` before `composer test:integration`.

- [ ] **Step 8: Commit**

```bash
git add lib/Migration/Version030600Date20260928000000.php lib/Db/Note.php lib/Db/NoteMapper.php tests/unit/Migration/Version030600Date20260928000000Test.php tests/integration/NoteMapperTest.php
git commit -m "feat(notes): add shared notes table, entity and mapper"
```

---

### Task 2: Payload validation

**Files:**
- Create: `lib/Service/Exception/InvalidNoteException.php`
- Create: `lib/Service/Exception/NoteLimitException.php`
- Create: `lib/Service/NotePayload.php`
- Test: `tests/unit/Service/NotePayloadTest.php`

**Interfaces:**
- Produces: `NotePayload::validate(string $type, mixed $payload, bool $allowScene = false): array`. It returns the normalized payload, with coordinates as floats, and throws `InvalidNoteException` with a user-safe message.
- Produces: constants `NotePayload::TYPES = ['annotation', 'measurement']`, `NotePayload::MAX_TEXT_CHARS = 2000`, `NotePayload::MAX_BYTES = 10240`.
- Produces: `NoteLimitException extends InvalidNoteException`.
- Produces: `NotePayload::encode(array $normalized): string`, the JSON that is stored.

- [ ] **Step 1: Write the failing tests**

`tests/unit/Service/NotePayloadTest.php`:

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Service\Exception\InvalidNoteException;
use OCA\ThreeDViewer\Service\NotePayload;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class NotePayloadTest extends TestCase
{
    private const POINT = ['x' => 1, 'y' => 2.5, 'z' => -3];

    public function testNormalizesAnAnnotation(): void
    {
        $out = NotePayload::validate('annotation', ['space' => 'model', 'point' => self::POINT, 'text' => 'Bracket']);

        $this->assertSame(['space' => 'model', 'point' => ['x' => 1.0, 'y' => 2.5, 'z' => -3.0], 'text' => 'Bracket'], $out);
    }

    public function testNormalizesAMeasurement(): void
    {
        $out = NotePayload::validate('measurement', ['space' => 'model', 'points' => [self::POINT, self::POINT]]);

        $this->assertCount(2, $out['points']);
        $this->assertSame(-3.0, $out['points'][1]['z']);
    }

    public function testSceneSpaceIsOnlyAcceptedWhenAllowed(): void
    {
        $payload = ['space' => 'scene', 'point' => self::POINT, 'text' => ''];

        $this->assertSame('scene', NotePayload::validate('annotation', $payload, true)['space']);

        $this->expectException(InvalidNoteException::class);
        NotePayload::validate('annotation', $payload);
    }

    /** @return array<string, array{0: string, 1: mixed}> */
    public static function invalidProvider(): array
    {
        $point = self::POINT;

        return [
            'unknown type' => ['comment', ['space' => 'model']],
            'payload not an object' => ['annotation', 'text'],
            'payload is a list' => ['annotation', [1, 2, 3]],
            'missing space' => ['annotation', ['point' => $point, 'text' => '']],
            'unknown key' => ['annotation', ['space' => 'model', 'point' => $point, 'text' => '', 'color' => 'red']],
            'text not a string' => ['annotation', ['space' => 'model', 'point' => $point, 'text' => 5]],
            'text too long' => ['annotation', ['space' => 'model', 'point' => $point, 'text' => str_repeat('a', 2001)]],
            'coordinate is a string' => ['annotation', ['space' => 'model', 'point' => ['x' => '1', 'y' => 0, 'z' => 0], 'text' => '']],
            'coordinate infinite' => ['annotation', ['space' => 'model', 'point' => ['x' => INF, 'y' => 0, 'z' => 0], 'text' => '']],
            'coordinate NaN' => ['annotation', ['space' => 'model', 'point' => ['x' => NAN, 'y' => 0, 'z' => 0], 'text' => '']],
            'point extra key' => ['annotation', ['space' => 'model', 'point' => $point + ['w' => 1], 'text' => '']],
            'measurement one point' => ['measurement', ['space' => 'model', 'points' => [$point]]],
            'measurement three points' => ['measurement', ['space' => 'model', 'points' => [$point, $point, $point]]],
            'measurement with text' => ['measurement', ['space' => 'model', 'points' => [$point, $point], 'text' => '']],
        ];
    }

    #[DataProvider('invalidProvider')]
    public function testRejects(string $type, mixed $payload): void
    {
        $this->expectException(InvalidNoteException::class);
        NotePayload::validate($type, $payload);
    }

    /** Review focus: a full-length note in a four-byte script must not trip the byte cap. */
    public function testMaxLengthEmojiTextFitsTheByteCap(): void
    {
        $text = str_repeat('🔩', NotePayload::MAX_TEXT_CHARS);

        $out = NotePayload::validate('annotation', ['space' => 'model', 'point' => self::POINT, 'text' => $text]);

        $this->assertSame($text, $out['text']);
    }

    /** Quotes and backslashes double when escaped; the cap must hold for them too. */
    public function testMaxLengthEscapedTextFitsTheByteCap(): void
    {
        $text = str_repeat('"\\', NotePayload::MAX_TEXT_CHARS / 2);

        $out = NotePayload::validate('annotation', ['space' => 'model', 'point' => self::POINT, 'text' => $text]);

        $this->assertSame($text, $out['text']);
    }

    public function testEncodeRoundTrips(): void
    {
        $normalized = NotePayload::validate('annotation', ['space' => 'model', 'point' => self::POINT, 'text' => 'ü']);

        $this->assertSame($normalized, json_decode(NotePayload::encode($normalized), true));
    }
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `composer test:unit -- --filter NotePayloadTest`
Expected: FAIL with `Class "OCA\ThreeDViewer\Service\NotePayload" not found`.

- [ ] **Step 3: Write the exceptions and the validator**

`lib/Service/Exception/InvalidNoteException.php`:

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service\Exception;

/**
 * A note the API refuses to store. The message is safe to show the client.
 */
class InvalidNoteException extends \InvalidArgumentException
{
}
```

`lib/Service/Exception/NoteLimitException.php`:

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service\Exception;

/**
 * The model already holds the maximum number of notes.
 */
class NoteLimitException extends InvalidNoteException
{
}
```

`lib/Service/NotePayload.php`:

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCA\ThreeDViewer\Service\Exception\InvalidNoteException;

/**
 * The shape of a stored note, checked before anything reaches the database.
 *
 * Unknown keys are refused rather than ignored: a field that is silently dropped today is
 * a field some client starts depending on tomorrow.
 */
final class NotePayload
{
    public const TYPES = ['annotation', 'measurement'];

    public const MAX_TEXT_CHARS = 2000;

    /**
     * Set above what MAX_TEXT_CHARS can need — 2,000 four-byte characters, or 2,000
     * characters that each escape to two — so the byte cap never rejects a note the
     * character cap allows.
     */
    public const MAX_BYTES = 10240;

    private const ENCODE_FLAGS = JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION;

    /**
     * @param bool $allowScene only the legacy migration writes scene-space points
     * @return array<string, mixed> the normalized payload
     * @throws InvalidNoteException
     */
    public static function validate(string $type, mixed $payload, bool $allowScene = false): array
    {
        if (!in_array($type, self::TYPES, true)) {
            throw new InvalidNoteException('Unknown note type');
        }
        if (!is_array($payload) || ($payload !== [] && array_is_list($payload))) {
            throw new InvalidNoteException('Payload must be an object');
        }

        $space = $payload['space'] ?? null;
        if (!in_array($space, $allowScene ? ['model', 'scene'] : ['model'], true)) {
            throw new InvalidNoteException('Invalid coordinate space');
        }

        if ($type === 'annotation') {
            self::onlyKeys($payload, ['space', 'point', 'text']);
            $text = $payload['text'] ?? null;
            if (!is_string($text)) {
                throw new InvalidNoteException('Annotation text must be a string');
            }
            if (mb_strlen($text) > self::MAX_TEXT_CHARS) {
                throw new InvalidNoteException('Annotation text is too long');
            }
            $normalized = ['space' => $space, 'point' => self::point($payload['point'] ?? null), 'text' => $text];
        } else {
            self::onlyKeys($payload, ['space', 'points']);
            $points = $payload['points'] ?? null;
            if (!is_array($points) || !array_is_list($points) || count($points) !== 2) {
                throw new InvalidNoteException('A measurement needs exactly two points');
            }
            $normalized = ['space' => $space, 'points' => [self::point($points[0]), self::point($points[1])]];
        }

        if (strlen(self::encode($normalized)) > self::MAX_BYTES) {
            throw new InvalidNoteException('Note is too large');
        }

        return $normalized;
    }

    /**
     * @param array<string, mixed> $normalized output of validate()
     */
    public static function encode(array $normalized): string
    {
        return json_encode($normalized, self::ENCODE_FLAGS);
    }

    /**
     * @param array<array-key, mixed> $data
     * @param list<string> $allowed
     */
    private static function onlyKeys(array $data, array $allowed): void
    {
        $extra = array_diff(array_map('strval', array_keys($data)), $allowed);
        if ($extra !== []) {
            throw new InvalidNoteException('Unknown field: ' . implode(', ', $extra));
        }
    }

    /**
     * @return array{x: float, y: float, z: float}
     */
    private static function point(mixed $point): array
    {
        if (!is_array($point)) {
            throw new InvalidNoteException('Point must be an object');
        }
        self::onlyKeys($point, ['x', 'y', 'z']);

        $out = [];
        foreach (['x', 'y', 'z'] as $axis) {
            $value = $point[$axis] ?? null;
            if (!is_int($value) && !is_float($value)) {
                throw new InvalidNoteException("Coordinate $axis must be a number");
            }
            if (!is_finite((float) $value)) {
                throw new InvalidNoteException("Coordinate $axis must be finite");
            }
            $out[$axis] = (float) $value;
        }

        return $out;
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `composer test:unit -- --filter NotePayloadTest`
Expected: PASS (19 tests: 14 data-provider rows plus 5 others).

- [ ] **Step 5: Commit**

```bash
git add lib/Service/Exception/InvalidNoteException.php lib/Service/Exception/NoteLimitException.php lib/Service/NotePayload.php tests/unit/Service/NotePayloadTest.php
git commit -m "feat(notes): validate note payloads"
```

---

### Task 3: Access from the model file

**Files:**
- Create: `lib/Service/NoteAccessResult.php`
- Create: `lib/Service/NoteAccess.php`
- Test: `tests/unit/Service/NoteAccessTest.php`

**Interfaces:**
- Produces: `final class NoteAccessResult { public function __construct(public readonly bool $canEdit) }`
- Produces: `NoteAccess::forUser(int $fileId, string $uid): ?NoteAccessResult`. It returns `null` when the user can't see the file (or the ID is a folder), and otherwise a result whose `canEdit` is true when any path to the file is updateable.

- [ ] **Step 1: Write the failing tests**

`tests/unit/Service/NoteAccessTest.php`:

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Service\NoteAccess;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotPermittedException;
use PHPUnit\Framework\TestCase;

class NoteAccessTest extends TestCase
{
    public function testNoNodeMeansNoAccess(): void
    {
        $this->assertNull($this->access([])->forUser(7, 'alice'));
    }

    public function testAFolderIsNotANoteTarget(): void
    {
        $this->assertNull($this->access([$this->createMock(Folder::class)])->forUser(7, 'alice'));
    }

    public function testReadOnlyFileGivesReadOnlyAccess(): void
    {
        $result = $this->access([$this->file(false)])->forUser(7, 'alice');

        $this->assertNotNull($result);
        $this->assertFalse($result->canEdit);
    }

    /** One file can be mounted twice — say a read-only share and the owner's own copy. */
    public function testAnyUpdateablePathGrantsEdit(): void
    {
        $result = $this->access([$this->file(false), $this->file(true)])->forUser(7, 'alice');

        $this->assertTrue($result?->canEdit);
    }

    public function testAnUnresolvableUserFolderMeansNoAccess(): void
    {
        $root = $this->createMock(IRootFolder::class);
        $root->method('getUserFolder')->willThrowException(new NotPermittedException());

        $this->assertNull((new NoteAccess($root))->forUser(7, 'alice'));
    }

    /** @param list<object> $nodes */
    private function access(array $nodes): NoteAccess
    {
        $home = $this->createMock(Folder::class);
        $home->method('getById')->with(7)->willReturn($nodes);
        $root = $this->createMock(IRootFolder::class);
        $root->method('getUserFolder')->with('alice')->willReturn($home);

        return new NoteAccess($root);
    }

    private function file(bool $updateable): File
    {
        $file = $this->createMock(File::class);
        $file->method('isUpdateable')->willReturn($updateable);

        return $file;
    }
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `composer test:unit -- --filter NoteAccessTest`
Expected: FAIL with `Class "OCA\ThreeDViewer\Service\NoteAccess" not found`.

- [ ] **Step 3: Write the classes**

`lib/Service/NoteAccessResult.php`:

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

/**
 * What a signed-in user may do with a model's notes. Reading is implied by existing.
 */
final class NoteAccessResult
{
    public function __construct(
        public readonly bool $canEdit,
    ) {
    }
}
```

`lib/Service/NoteAccess.php`:

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\Files\NotPermittedException;

/**
 * Rights over a model's notes, derived from the model file on every request.
 *
 * Never from the note: a note has no permissions of its own, so anything that asked the
 * note would be asking the wrong thing.
 */
class NoteAccess
{
    public function __construct(
        private readonly IRootFolder $rootFolder,
    ) {
    }

    public function forUser(int $fileId, string $uid): ?NoteAccessResult
    {
        try {
            $nodes = $this->rootFolder->getUserFolder($uid)->getById($fileId);
        } catch (NotPermittedException) {
            return null;
        } catch (\Exception) {
            // getUserFolder() throws the server-internal NoUserException for an unknown
            // user. Naming it would reach into private API (NoPrivateServerApiTest), so any
            // other failure to resolve the folder means the same thing: no access.
            return null;
        }

        $files = array_filter($nodes, static fn ($node) => $node instanceof File);
        if ($files === []) {
            return null;
        }

        foreach ($files as $file) {
            if ($file->isUpdateable()) {
                return new NoteAccessResult(true);
            }
        }

        return new NoteAccessResult(false);
    }
}
```

- [ ] **Step 4: Run the tests and the private-API guard**

Run: `composer test:unit -- --filter 'NoteAccessTest|NoPrivateServerApiTest'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/Service/NoteAccessResult.php lib/Service/NoteAccess.php tests/unit/Service/NoteAccessTest.php
git commit -m "feat(notes): derive note access from the model file"
```

---

### Task 4: NotesService (CRUD, serialization, legacy migration)

**Files:**
- Create: `lib/Service/NotesService.php`
- Modify: `lib/Service/AnnotationsService.php` (remove `save()` and `MAX_PAYLOAD_BYTES`; update the class docblock)
- Test: `tests/unit/Service/NotesServiceTest.php`

**Interfaces:**
- Consumes: `NoteMapper` (Task 1); `NotePayload`, `InvalidNoteException`, `NoteLimitException` (Task 2); `AnnotationsService::load(int $fileId, string $userId): ?string` and `::delete(int $fileId, string $userId): bool`.
- Produces:
  - `NotesService::MAX_NOTES_PER_FILE = 1000`
  - `list(int $fileId): Note[]`
  - `create(int $fileId, string $type, mixed $payload, string $uid): Note`, which throws `InvalidNoteException` or `NoteLimitException`.
  - `update(int $fileId, int $noteId, mixed $payload): Note`, which throws `DoesNotExistException` or `InvalidNoteException`.
  - `delete(int $fileId, int $noteId): void`, which throws `DoesNotExistException`.
  - `migrateLegacy(int $fileId, string $uid, bool $canEdit): array`, a list of serialized private notes, empty unless the user can't edit.
  - `serialize(Note $note, bool $withAuthor): array` with keys `id`, `type`, `payload`, `author`, `createdAt`, `updatedAt`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/Service/NotesServiceTest.php`:

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Db\Note;
use OCA\ThreeDViewer\Db\NoteMapper;
use OCA\ThreeDViewer\Service\AnnotationsService;
use OCA\ThreeDViewer\Service\Exception\InvalidNoteException;
use OCA\ThreeDViewer\Service\Exception\NoteLimitException;
use OCA\ThreeDViewer\Service\NotesService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IDBConnection;
use OCP\IUserManager;
use OCP\Lock\ILockingProvider;
use OCP\Lock\LockedException;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class NotesServiceTest extends TestCase
{
    private const LEGACY = '{"format":"threedviewer-annotations","version":1,"annotations":['
        . '{"id":1,"point":{"x":1,"y":2,"z":3},"text":"Hole","timestamp":"2026-01-02T03:04:05Z"},'
        . '{"id":2,"point":{"x":"bad","y":2,"z":3},"text":"Broken"}]}';

    private NoteMapper&MockObject $mapper;
    private AnnotationsService&MockObject $legacy;
    private IUserManager&MockObject $users;
    private IDBConnection&MockObject $db;
    private ILockingProvider&MockObject $locking;
    private NotesService $service;

    protected function setUp(): void
    {
        $this->mapper = $this->createMock(NoteMapper::class);
        $this->legacy = $this->createMock(AnnotationsService::class);
        $this->users = $this->createMock(IUserManager::class);
        $this->db = $this->createMock(IDBConnection::class);
        $this->locking = $this->createMock(ILockingProvider::class);
        $time = $this->createMock(ITimeFactory::class);
        $time->method('getTime')->willReturn(1_800_000_000);

        $this->mapper->method('insert')->willReturnCallback(function (Note $note) {
            $note->setId(99);

            return $note;
        });
        $this->mapper->method('update')->willReturnArgument(0);

        $this->service = new NotesService(
            $this->mapper, $this->legacy, $this->users, $this->db, $this->locking, $time,
            $this->createMock(LoggerInterface::class),
        );
    }

    public function testCreateStoresTheNormalizedPayloadAndAuthor(): void
    {
        $this->mapper->method('countByFile')->willReturn(0);

        $note = $this->service->create(7, 'annotation', ['space' => 'model', 'point' => ['x' => 1, 'y' => 2, 'z' => 3], 'text' => 'Hi'], 'alice');

        $this->assertSame(7, $note->getFileId());
        $this->assertSame('alice', $note->getAuthorUid());
        $this->assertSame('{"space":"model","point":{"x":1.0,"y":2.0,"z":3.0},"text":"Hi"}', $note->getPayload());
        $this->assertSame(1_800_000_000, $note->getCreatedAt());
    }

    public function testCreateRefusesSceneSpace(): void
    {
        $this->mapper->method('countByFile')->willReturn(0);

        $this->expectException(InvalidNoteException::class);
        $this->service->create(7, 'annotation', ['space' => 'scene', 'point' => ['x' => 1, 'y' => 2, 'z' => 3], 'text' => ''], 'alice');
    }

    public function testCreateRefusesTheThousandAndFirstNote(): void
    {
        $this->mapper->method('countByFile')->willReturn(NotesService::MAX_NOTES_PER_FILE);
        $this->mapper->expects($this->never())->method('insert');

        $this->expectException(NoteLimitException::class);
        $this->service->create(7, 'measurement', ['space' => 'model', 'points' => [['x' => 0, 'y' => 0, 'z' => 0], ['x' => 1, 'y' => 0, 'z' => 0]]], 'alice');
    }

    public function testUpdateValidatesAgainstTheStoredType(): void
    {
        $this->mapper->method('findInFile')->with(7, 5)->willReturn($this->note(5, 'measurement', '{}'));

        $this->expectException(InvalidNoteException::class);
        $this->service->update(7, 5, ['space' => 'model', 'point' => ['x' => 0, 'y' => 0, 'z' => 0], 'text' => 'x']);
    }

    public function testUpdateReplacesPayloadAndTouchesUpdatedAt(): void
    {
        $this->mapper->method('findInFile')->willReturn($this->note(5, 'annotation', '{}'));

        $note = $this->service->update(7, 5, ['space' => 'model', 'point' => ['x' => 0, 'y' => 0, 'z' => 0], 'text' => 'new']);

        $this->assertStringContainsString('"new"', $note->getPayload());
        $this->assertSame(1_800_000_000, $note->getUpdatedAt());
    }

    public function testSerializeHidesTheAuthorWhenAsked(): void
    {
        $this->users->method('getDisplayName')->with('alice')->willReturn('Alice A.');
        $note = $this->note(5, 'annotation', '{"space":"model","point":{"x":0,"y":0,"z":0},"text":"t"}');

        $this->assertSame(['uid' => 'alice', 'displayName' => 'Alice A.'], $this->service->serialize($note, true)['author']);
        $this->assertNull($this->service->serialize($note, false)['author']);
    }

    public function testSerializeReportsADeletedAuthorAsNull(): void
    {
        $this->users->method('getDisplayName')->willReturn(null);

        $this->assertNull($this->service->serialize($this->note(5, 'annotation', '{}'), true)['author']);
    }

    public function testMigrationForAReadOnlyUserReturnsPrivateNotesAndKeepsTheDocument(): void
    {
        $this->legacy->method('load')->willReturn(self::LEGACY);
        $this->legacy->expects($this->never())->method('delete');
        $this->mapper->expects($this->never())->method('insert');

        $private = $this->service->migrateLegacy(7, 'bob', false);

        $this->assertCount(1, $private, 'the item with a non-numeric coordinate is skipped');
        $this->assertSame('private-0', $private[0]['id']);
        $this->assertSame('scene', $private[0]['payload']['space']);
        $this->assertSame('Hole', $private[0]['payload']['text']);
    }

    public function testMigrationForAnEditorMovesNotesInsideOneTransaction(): void
    {
        $this->legacy->method('load')->willReturn(self::LEGACY);
        $this->mapper->method('countByFile')->willReturn(0);
        $this->db->expects($this->once())->method('beginTransaction');
        $this->mapper->expects($this->once())->method('insert');
        $this->legacy->expects($this->once())->method('delete')->with(7, 'alice')->willReturn(true);
        $this->db->expects($this->once())->method('commit');
        $this->locking->expects($this->once())->method('releaseLock');

        $this->assertSame([], $this->service->migrateLegacy(7, 'alice', true));
    }

    public function testMigrationRollsBackWhenTheDocumentCannotBeRemoved(): void
    {
        $this->legacy->method('load')->willReturn(self::LEGACY);
        $this->mapper->method('countByFile')->willReturn(0);
        $this->legacy->method('delete')->willReturn(false);
        $this->db->expects($this->never())->method('commit');
        $this->db->expects($this->once())->method('rollBack');

        $this->service->migrateLegacy(7, 'alice', true);
    }

    /** Review focus: a second tab that finds the lock held must not migrate as well. */
    public function testMigrationSkipsWhenAnotherRequestHoldsTheLock(): void
    {
        $this->legacy->method('load')->willReturn(self::LEGACY);
        $this->locking->method('acquireLock')->willThrowException(new LockedException('held'));
        $this->mapper->expects($this->never())->method('insert');

        $this->assertSame([], $this->service->migrateLegacy(7, 'alice', true));
    }

    /** The first request may finish the move between our first read and taking the lock. */
    public function testMigrationRereadsTheDocumentUnderTheLock(): void
    {
        $this->legacy->method('load')->willReturnOnConsecutiveCalls(self::LEGACY, null);
        $this->mapper->expects($this->never())->method('insert');
        $this->db->expects($this->never())->method('beginTransaction');

        $this->service->migrateLegacy(7, 'alice', true);
    }

    public function testMigrationWithoutALegacyDocumentDoesNothing(): void
    {
        $this->legacy->method('load')->willReturn(null);
        $this->locking->expects($this->never())->method('acquireLock');

        $this->assertSame([], $this->service->migrateLegacy(7, 'alice', true));
    }

    private function note(int $id, string $type, string $payload): Note
    {
        $note = new Note();
        $note->setId($id);
        $note->setFileId(7);
        $note->setType($type);
        $note->setPayload($payload);
        $note->setAuthorUid('alice');
        $note->setCreatedAt(1);
        $note->setUpdatedAt(1);

        return $note;
    }
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `composer test:unit -- --filter NotesServiceTest`
Expected: FAIL with `Class "OCA\ThreeDViewer\Service\NotesService" not found`.

- [ ] **Step 3: Write the service**

`lib/Service/NotesService.php`:

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

use OCA\ThreeDViewer\Db\Note;
use OCA\ThreeDViewer\Db\NoteMapper;
use OCA\ThreeDViewer\Service\Exception\InvalidNoteException;
use OCA\ThreeDViewer\Service\Exception\NoteLimitException;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IDBConnection;
use OCP\IUserManager;
use OCP\Lock\ILockingProvider;
use OCP\Lock\LockedException;
use Psr\Log\LoggerInterface;

/**
 * The shared annotations and measurements of a model.
 *
 * Callers are expected to have checked access with NoteAccess first; nothing here knows
 * who may do what.
 */
class NotesService
{
    public const MAX_NOTES_PER_FILE = 1000;

    /** @var array<string, ?string> display names already looked up in this request */
    private array $displayNames = [];

    public function __construct(
        private readonly NoteMapper $mapper,
        private readonly AnnotationsService $legacy,
        private readonly IUserManager $users,
        private readonly IDBConnection $db,
        private readonly ILockingProvider $locking,
        private readonly ITimeFactory $time,
        private readonly LoggerInterface $logger,
    ) {
    }

    /** @return Note[] */
    public function list(int $fileId): array
    {
        return $this->mapper->findByFile($fileId);
    }

    /**
     * The limit is checked before the insert rather than enforced by the database, so two
     * simultaneous creates can land one over it. It exists to stop a runaway client, not
     * to count exactly.
     *
     * @throws InvalidNoteException
     * @throws NoteLimitException
     */
    public function create(int $fileId, string $type, mixed $payload, string $uid): Note
    {
        $normalized = NotePayload::validate($type, $payload);
        if ($this->mapper->countByFile($fileId) >= self::MAX_NOTES_PER_FILE) {
            throw new NoteLimitException('This model already has the maximum number of notes');
        }

        return $this->mapper->insert($this->newNote($fileId, $type, $normalized, $uid, $this->time->getTime()));
    }

    /**
     * @throws DoesNotExistException
     * @throws InvalidNoteException
     */
    public function update(int $fileId, int $noteId, mixed $payload): Note
    {
        $note = $this->mapper->findInFile($fileId, $noteId);
        $normalized = NotePayload::validate($note->getType(), $payload);
        $note->setPayload(NotePayload::encode($normalized));
        $note->setUpdatedAt($this->time->getTime());

        return $this->mapper->update($note);
    }

    /**
     * @throws DoesNotExistException
     */
    public function delete(int $fileId, int $noteId): void
    {
        $this->mapper->delete($this->mapper->findInFile($fileId, $noteId));
    }

    /**
     * Move the caller's pre-3.6 private annotations for this model into the shared set.
     *
     * An editor's annotations become shared notes, authored by them, in scene space until
     * the viewer converts them. Someone who can't edit the model can't write to the
     * shared set, migration or not, so their annotations stay where they are and come
     * back as private notes only they see.
     *
     * @return list<array<string, mixed>> private notes; empty for editors
     */
    public function migrateLegacy(int $fileId, string $uid, bool $canEdit): array
    {
        $raw = $this->legacy->load($fileId, $uid);
        if ($raw === null) {
            return [];
        }

        if (!$canEdit) {
            return $this->privateNotes($this->legacyItems($raw), $uid);
        }

        // Two tabs opening the model at once would otherwise both read the document and
        // both insert it. Whoever doesn't get the lock skips the move this time.
        $lockKey = 'threedviewer/legacy-notes/' . $uid . '/' . $fileId;
        try {
            $this->locking->acquireLock($lockKey, ILockingProvider::LOCK_EXCLUSIVE);
        } catch (LockedException) {
            return [];
        }

        try {
            // Re-read under the lock: the request that held it may have finished the move.
            $raw = $this->legacy->load($fileId, $uid);
            if ($raw === null) {
                return [];
            }
            $this->moveToShared($fileId, $uid, $this->legacyItems($raw));
        } finally {
            $this->locking->releaseLock($lockKey, ILockingProvider::LOCK_EXCLUSIVE);
        }

        return [];
    }

    /**
     * @return array{id: int|string, type: string, payload: mixed, author: ?array{uid: string, displayName: string}, createdAt: int, updatedAt: int}
     */
    public function serialize(Note $note, bool $withAuthor): array
    {
        return [
            'id' => $note->getId(),
            'type' => $note->getType(),
            'payload' => json_decode($note->getPayload(), true),
            'author' => $withAuthor ? $this->author($note->getAuthorUid()) : null,
            'createdAt' => $note->getCreatedAt(),
            'updatedAt' => $note->getUpdatedAt(),
        ];
    }

    /**
     * @param list<array{payload: array<string, mixed>, createdAt: int}> $items
     */
    private function moveToShared(int $fileId, string $uid, array $items): void
    {
        $room = max(0, self::MAX_NOTES_PER_FILE - $this->mapper->countByFile($fileId));
        if (count($items) > $room) {
            $this->logger->warning('NotesService: legacy annotations over the note limit were dropped', [
                'fileId' => $fileId,
                'dropped' => count($items) - $room,
            ]);
        }

        $this->db->beginTransaction();
        try {
            foreach (array_slice($items, 0, $room) as $item) {
                $this->mapper->insert($this->newNote($fileId, 'annotation', $item['payload'], $uid, $item['createdAt']));
            }
            // Removing the document inside the transaction is what makes the move happen
            // once: if it can't be removed, the inserts are rolled back and the next open
            // tries again from the same document.
            if (!$this->legacy->delete($fileId, $uid)) {
                throw new \RuntimeException('Could not remove the legacy annotation document');
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            $this->logger->error('NotesService: legacy annotation migration failed', [
                'fileId' => $fileId,
                'exception' => $e,
            ]);
        }
    }

    /**
     * @return list<array{payload: array<string, mixed>, createdAt: int}>
     */
    private function legacyItems(string $raw): array
    {
        $doc = json_decode($raw, true);
        if (!is_array($doc) || !is_array($doc['annotations'] ?? null)) {
            return [];
        }

        $items = [];
        foreach ($doc['annotations'] as $annotation) {
            if (!is_array($annotation)) {
                continue;
            }
            $text = is_string($annotation['text'] ?? null) ? mb_substr($annotation['text'], 0, NotePayload::MAX_TEXT_CHARS) : '';
            try {
                $payload = NotePayload::validate('annotation', [
                    'space' => 'scene',
                    'point' => $annotation['point'] ?? null,
                    'text' => $text,
                ], true);
            } catch (InvalidNoteException) {
                continue;
            }
            $timestamp = is_string($annotation['timestamp'] ?? null) ? strtotime($annotation['timestamp']) : false;
            $items[] = ['payload' => $payload, 'createdAt' => $timestamp === false ? $this->time->getTime() : $timestamp];
        }

        return $items;
    }

    /**
     * @param list<array{payload: array<string, mixed>, createdAt: int}> $items
     * @return list<array<string, mixed>>
     */
    private function privateNotes(array $items, string $uid): array
    {
        $notes = [];
        foreach ($items as $index => $item) {
            $notes[] = [
                'id' => 'private-' . $index,
                'type' => 'annotation',
                'payload' => $item['payload'],
                'author' => $this->author($uid),
                'createdAt' => $item['createdAt'],
                'updatedAt' => $item['createdAt'],
            ];
        }

        return $notes;
    }

    /**
     * @param array<string, mixed> $normalized
     */
    private function newNote(int $fileId, string $type, array $normalized, string $uid, int $createdAt): Note
    {
        $note = new Note();
        $note->setFileId($fileId);
        $note->setType($type);
        $note->setPayload(NotePayload::encode($normalized));
        $note->setAuthorUid($uid);
        $note->setCreatedAt($createdAt);
        $note->setUpdatedAt($createdAt);

        return $note;
    }

    /**
     * @return ?array{uid: string, displayName: string}
     */
    private function author(string $uid): ?array
    {
        if (!array_key_exists($uid, $this->displayNames)) {
            $this->displayNames[$uid] = $this->users->getDisplayName($uid);
        }
        $name = $this->displayNames[$uid];

        return $name === null ? null : ['uid' => $uid, 'displayName' => $name];
    }
}
```

- [ ] **Step 4: Trim AnnotationsService to read and delete**

In `lib/Service/AnnotationsService.php`:
- Delete the `save()` method, the `MAX_PAYLOAD_BYTES` constant, and `getOrCreateUserFolder()` (only `save()` used it).
- Remove `use OCP\Files\NotPermittedException;` if it's no longer referenced.
- Replace the class docblock with:

```php
/**
 * Read-only access to the pre-3.6 private annotation documents.
 *
 * Before 3.6 each user's annotations for a model were kept in app data under
 * `annotations/{userId}/{fileId}.json`. Shared notes replaced them; this class now exists
 * only so NotesService::migrateLegacy() can read a document and remove it once moved.
 */
```

- [ ] **Step 5: Run the tests**

Run: `composer test:unit -- --filter 'NotesServiceTest|NoPrivateServerApiTest'`
Expected: PASS (13 tests in `NotesServiceTest`).

- [ ] **Step 6: Commit**

```bash
git add lib/Service/NotesService.php lib/Service/AnnotationsService.php tests/unit/Service/NotesServiceTest.php
git commit -m "feat(notes): store shared notes and migrate private annotations"
```

---

### Task 5: Signed-in API (NotesController), with the legacy controller removed

**Files:**
- Create: `lib/Controller/NotesController.php`
- Delete: `lib/Controller/AnnotationsController.php`
- Modify: `openapi.json` (regenerate)
- Test: `tests/unit/Controller/NotesControllerTest.php`

**Interfaces:**
- Consumes: `NoteAccess::forUser()` (Task 3); `NotesService` (Task 4).
- Produces the following HTTP routes:
  - `GET /apps/threedviewer/api/notes/{fileId}` returns `{canEdit: bool, notes: Note[], private: Note[]}`.
  - `POST /apps/threedviewer/api/notes/{fileId}` with body `{type, payload}` returns `201` and the Note.
  - `PATCH /apps/threedviewer/api/notes/{fileId}/{noteId}` with body `{payload}` returns `200` and the Note.
  - `DELETE /apps/threedviewer/api/notes/{fileId}/{noteId}` returns `204`.
  - Status codes follow Global Constraints.

- [ ] **Step 1: Write the failing tests**

`tests/unit/Controller/NotesControllerTest.php`:

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use OCA\ThreeDViewer\Controller\NotesController;
use OCA\ThreeDViewer\Db\Note;
use OCA\ThreeDViewer\Service\Exception\InvalidNoteException;
use OCA\ThreeDViewer\Service\Exception\NoteLimitException;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\NoteAccess;
use OCA\ThreeDViewer\Service\NoteAccessResult;
use OCA\ThreeDViewer\Service\NotesService;
use OCA\ThreeDViewer\Service\ResponseBuilder;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\ICache;
use OCP\ICacheFactory;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class NotesControllerTest extends TestCase
{
    private NoteAccess&MockObject $access;
    private NotesService&MockObject $notes;
    private NotesController $controller;

    protected function setUp(): void
    {
        $this->access = $this->createMock(NoteAccess::class);
        $this->notes = $this->createMock(NotesService::class);
        $this->notes->method('serialize')->willReturnCallback(fn (Note $n) => ['id' => $n->getId()]);

        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('alice');
        $session = $this->createMock(IUserSession::class);
        $session->method('getUser')->willReturn($user);

        $cacheFactory = $this->createMock(ICacheFactory::class);
        $cacheFactory->method('createDistributed')->willReturn($this->createMock(ICache::class));

        $this->controller = new NotesController(
            'threedviewer',
            $this->createMock(IRequest::class),
            $session,
            $this->access,
            $this->notes,
            new ResponseBuilder($this->createMock(ModelFileSupport::class)),
            $this->createMock(ModelFileSupport::class),
            $this->createMock(LoggerInterface::class),
            $cacheFactory,
        );
    }

    /**
     * Every route, reads included: the read runs the legacy migration, which publishes
     * private annotations, so a forged cross-site request must not reach it.
     */
    public function testNoRouteOptsOutOfCsrf(): void
    {
        foreach ((new \ReflectionClass(NotesController::class))->getMethods(\ReflectionMethod::IS_PUBLIC) as $method) {
            $this->assertSame([], $method->getAttributes(NoCSRFRequired::class), $method->getName() . ' must require the CSRF token');
        }
    }

    public function testInaccessibleFileIs404ForEveryRoute(): void
    {
        $this->access->method('forUser')->willReturn(null);

        $this->assertSame(404, $this->controller->index(7)->getStatus());
        $this->assertSame(404, $this->controller->create(7, 'annotation', [])->getStatus());
        $this->assertSame(404, $this->controller->update(7, 1, [])->getStatus());
        $this->assertSame(404, $this->controller->destroy(7, 1)->getStatus());
    }

    public function testIndexReturnsNotesEditRightAndPrivateNotes(): void
    {
        $this->access->method('forUser')->willReturn(new NoteAccessResult(false));
        $this->notes->expects($this->once())->method('migrateLegacy')->with(7, 'alice', false)->willReturn([['id' => 'private-0']]);
        $this->notes->method('list')->willReturn([$this->note(3)]);

        $response = $this->controller->index(7);

        $this->assertSame(200, $response->getStatus());
        $this->assertSame(['canEdit' => false, 'notes' => [['id' => 3]], 'private' => [['id' => 'private-0']]], $response->getData());
    }

    public function testReadOnlyUsersCannotWrite(): void
    {
        $this->access->method('forUser')->willReturn(new NoteAccessResult(false));
        $this->notes->expects($this->never())->method('create');
        $this->notes->expects($this->never())->method('update');
        $this->notes->expects($this->never())->method('delete');

        $this->assertSame(403, $this->controller->create(7, 'annotation', [])->getStatus());
        $this->assertSame(403, $this->controller->update(7, 1, [])->getStatus());
        $this->assertSame(403, $this->controller->destroy(7, 1)->getStatus());
    }

    public function testCreateReturns201(): void
    {
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true));
        $this->notes->method('create')->with(7, 'annotation', ['p'], 'alice')->willReturn($this->note(4));

        $response = $this->controller->create(7, 'annotation', ['p']);

        $this->assertSame(201, $response->getStatus());
        $this->assertSame(['id' => 4], $response->getData());
    }

    public function testInvalidPayloadIs400AndLimitIs409(): void
    {
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true));
        $this->notes->method('create')->willReturnOnConsecutiveCalls(
            $this->throwException(new InvalidNoteException('Bad')),
            $this->throwException(new NoteLimitException('Full')),
        );

        $this->assertSame(400, $this->controller->create(7, 'annotation', [])->getStatus());
        $this->assertSame(409, $this->controller->create(7, 'annotation', [])->getStatus());
    }

    public function testMissingNoteIs404(): void
    {
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true));
        $this->notes->method('update')->willThrowException(new DoesNotExistException(''));
        $this->notes->method('delete')->willThrowException(new DoesNotExistException(''));

        $this->assertSame(404, $this->controller->update(7, 1, [])->getStatus());
        $this->assertSame(404, $this->controller->destroy(7, 1)->getStatus());
    }

    public function testDeleteReturns204(): void
    {
        $this->access->method('forUser')->willReturn(new NoteAccessResult(true));
        $this->notes->expects($this->once())->method('delete')->with(7, 1);

        $this->assertSame(204, $this->controller->destroy(7, 1)->getStatus());
    }

    private function note(int $id): Note
    {
        $note = new Note();
        $note->setId($id);

        return $note;
    }
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `composer test:unit -- --filter NotesControllerTest`
Expected: FAIL with `Class "OCA\ThreeDViewer\Controller\NotesController" not found`.

- [ ] **Step 3: Write the controller**

`lib/Controller/NotesController.php`:

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\Service\Exception\InvalidNoteException;
use OCA\ThreeDViewer\Service\Exception\NoteLimitException;
use OCA\ThreeDViewer\Service\ModelFileSupport;
use OCA\ThreeDViewer\Service\NoteAccess;
use OCA\ThreeDViewer\Service\NoteAccessResult;
use OCA\ThreeDViewer\Service\NotesService;
use OCA\ThreeDViewer\Service\ResponseBuilder;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\ICacheFactory;
use OCP\IRequest;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

/**
 * The shared annotations and measurements of a model, for signed-in users.
 *
 * No route carries NoCSRFRequired — the read included, because it runs the legacy
 * migration, and that publishes a user's private annotations to everyone who can open
 * the model.
 */
class NotesController extends BaseController
{
    public function __construct(
        string $appName,
        IRequest $request,
        private readonly IUserSession $userSession,
        private readonly NoteAccess $access,
        private readonly NotesService $notes,
        ResponseBuilder $responseBuilder,
        ModelFileSupport $modelFileSupport,
        LoggerInterface $logger,
        ICacheFactory $cacheFactory,
    ) {
        parent::__construct($appName, $request, $responseBuilder, $modelFileSupport, $logger, $cacheFactory);
    }

    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'GET', url: '/api/notes/{fileId}')]
    public function index(int $fileId): JSONResponse
    {
        [$uid, $access] = $this->resolve($fileId);
        if ($access === null) {
            return $this->notFound();
        }

        $private = $this->notes->migrateLegacy($fileId, $uid, $access->canEdit);

        return new JSONResponse([
            'canEdit' => $access->canEdit,
            'notes' => array_map(fn ($note) => $this->notes->serialize($note, true), $this->notes->list($fileId)),
            'private' => $private,
        ]);
    }

    /**
     * @param mixed $payload decoded JSON body field, validated by NotesService
     */
    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'POST', url: '/api/notes/{fileId}')]
    public function create(int $fileId, string $type = '', mixed $payload = null): JSONResponse
    {
        [$uid, $access] = $this->resolve($fileId);
        if ($access === null) {
            return $this->notFound();
        }
        if (!$access->canEdit) {
            return $this->forbidden();
        }

        try {
            $note = $this->notes->create($fileId, $type, $payload, $uid);
        } catch (NoteLimitException $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_CONFLICT);
        } catch (InvalidNoteException $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
        }

        return new JSONResponse($this->notes->serialize($note, true), Http::STATUS_CREATED);
    }

    /**
     * @param mixed $payload decoded JSON body field, validated by NotesService
     */
    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'PATCH', url: '/api/notes/{fileId}/{noteId}')]
    public function update(int $fileId, int $noteId, mixed $payload = null): JSONResponse
    {
        [, $access] = $this->resolve($fileId);
        if ($access === null) {
            return $this->notFound();
        }
        if (!$access->canEdit) {
            return $this->forbidden();
        }

        try {
            $note = $this->notes->update($fileId, $noteId, $payload);
        } catch (DoesNotExistException) {
            return $this->notFound();
        } catch (InvalidNoteException $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
        }

        return new JSONResponse($this->notes->serialize($note, true));
    }

    #[NoAdminRequired]
    #[FrontpageRoute(verb: 'DELETE', url: '/api/notes/{fileId}/{noteId}')]
    public function destroy(int $fileId, int $noteId): JSONResponse
    {
        [, $access] = $this->resolve($fileId);
        if ($access === null) {
            return $this->notFound();
        }
        if (!$access->canEdit) {
            return $this->forbidden();
        }

        try {
            $this->notes->delete($fileId, $noteId);
        } catch (DoesNotExistException) {
            return $this->notFound();
        }

        return new JSONResponse(null, Http::STATUS_NO_CONTENT);
    }

    /**
     * @return array{0: string, 1: ?NoteAccessResult}
     */
    private function resolve(int $fileId): array
    {
        $uid = $this->userSession->getUser()?->getUID();
        if ($uid === null || $fileId <= 0) {
            return ['', null];
        }

        return [$uid, $this->access->forUser($fileId, $uid)];
    }

    /** Same answer whether the file doesn't exist or the caller can't see it. */
    private function notFound(): JSONResponse
    {
        return new JSONResponse(['error' => 'Not found'], Http::STATUS_NOT_FOUND);
    }

    private function forbidden(): JSONResponse
    {
        return new JSONResponse(['error' => 'This model is view-only for you'], Http::STATUS_FORBIDDEN);
    }
}
```

- [ ] **Step 4: Delete the legacy controller**

Run: `git rm lib/Controller/AnnotationsController.php`
Then run `grep -rn "AnnotationsController\|api/annotations" lib appinfo tests src`. The only expected hits are in `src/composables/useAnnotation.js`, which Task 11 removes. Anything else, update now.

- [ ] **Step 5: Run the tests**

Run: `composer test:unit -- --filter 'NotesControllerTest|NoPrivateServerApiTest'`
Expected: PASS.

- [ ] **Step 6: Regenerate the OpenAPI document and run the static checks**

Run: `composer run openapi && composer cs:fix && composer psalm`
Expected: `openapi.json` loses the `annotations` tag and gains `notes` routes. Psalm reports no new errors; fix any it raises in the new files, and don't add them to a baseline.

- [ ] **Step 7: Commit**

```bash
git add lib/Controller/NotesController.php tests/unit/Controller/NotesControllerTest.php openapi.json
git commit -m "feat(notes): add signed-in notes API and retire private annotations API"
```

---

### Task 6: Read-only public API (PublicNotesController)

**Files:**
- Create: `lib/Controller/PublicNotesController.php`
- Modify: `openapi.json` (regenerate)
- Test: `tests/unit/Controller/PublicNotesControllerTest.php`

**Interfaces:**
- Consumes: `ShareFileService::findValidLinkShare(string): ?IShare`, `ShareFileService::getFileFromShare(string $token, ?int $fileId): File`; `NotesService::list()`, `::serialize()`.
- Produces: `GET /ocs/v2.php/apps/threedviewer/public/notes/{token}/{fileId}`, returning `{canEdit: false, notes: Note[]}` with `author: null` on every note.

- [ ] **Step 1: Write the failing tests**

`tests/unit/Controller/PublicNotesControllerTest.php`:

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use OCA\ThreeDViewer\Controller\PublicNotesController;
use OCA\ThreeDViewer\Db\Note;
use OCA\ThreeDViewer\Service\NotesService;
use OCA\ThreeDViewer\Service\ShareFileService;
use OCP\AppFramework\PublicShareController;
use OCP\Files\File;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use OCP\ISession;
use OCP\Share\IShare;
use PHPUnit\Framework\TestCase;

class PublicNotesControllerTest extends TestCase
{
    public function testExtendsPublicShareControllerSoTheMiddlewareEnforcesPasswords(): void
    {
        $this->assertInstanceOf(PublicShareController::class, $this->controller(null, $this->createMock(NotesService::class)));
    }

    public function testPasswordProtectedShareIsNotAuthenticatedWithoutSession(): void
    {
        $share = $this->createMock(IShare::class);
        $share->method('getPassword')->willReturn('hash');
        $share->method('getId')->willReturn('42');

        $controller = $this->controller($share, $this->createMock(NotesService::class));
        $controller->setToken('tok');

        $this->assertTrue($controller->isValidToken());
        $this->assertFalse($controller->isAuthenticated());
    }

    public function testListsTheSharedFilesNotesWithoutAuthors(): void
    {
        $file = $this->createMock(File::class);
        $file->method('getId')->willReturn(7);
        $notes = $this->createMock(NotesService::class);
        $note = new Note();
        $note->setId(3);
        $notes->method('list')->with(7)->willReturn([$note]);
        $notes->expects($this->once())->method('serialize')->with($note, false)->willReturn(['id' => 3, 'author' => null]);

        $response = $this->controller($this->createMock(IShare::class), $notes, $file)->index('tok', 7);

        $this->assertSame(200, $response->getStatus());
        $this->assertSame(['canEdit' => false, 'notes' => [['id' => 3, 'author' => null]]], $response->getData());
    }

    public function testAFileOutsideTheShareIs404(): void
    {
        $response = $this->controller($this->createMock(IShare::class), $this->createMock(NotesService::class), null)->index('tok', 7);

        $this->assertSame(404, $response->getStatus());
    }

    private function controller(?IShare $share, NotesService $notes, ?File $file = null): PublicNotesController
    {
        $shares = $this->createMock(ShareFileService::class);
        $shares->method('findValidLinkShare')->willReturn($share);
        if ($file === null) {
            $shares->method('getFileFromShare')->willThrowException(new NotFoundException());
        } else {
            $shares->method('getFileFromShare')->willReturn($file);
        }

        // The session holds no share-password proof, as for a visitor who never typed it.
        // Same stub as PublicFileControllerAuthTest.
        $session = $this->createMock(ISession::class);
        $session->method('get')->willReturn('[]');

        return new PublicNotesController('threedviewer', $this->createMock(IRequest::class), $session, $shares, $notes);
    }
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `composer test:unit -- --filter PublicNotesControllerTest`
Expected: FAIL with `Class "OCA\ThreeDViewer\Controller\PublicNotesController" not found`.

- [ ] **Step 3: Write the controller**

`lib/Controller/PublicNotesController.php`:

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Controller;

use OCA\ThreeDViewer\Service\Exception\UnsupportedFileTypeException;
use OCA\ThreeDViewer\Service\NotesService;
use OCA\ThreeDViewer\Service\ShareFileService;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\ApiRoute;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\PublicShareController;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use OCP\ISession;
use OCP\Share\IShare;

/**
 * A shared model's notes, read-only, for visitors on a public link.
 *
 * MUST extend PublicShareController, for the reason PublicFileController gives: the
 * middleware enforces share passwords only for instances of it (GHSA-gjh8-x4wm-3cfj).
 * Authors are left out so a public link doesn't hand out the names of the people who
 * wrote on the model.
 *
 * @psalm-suppress UnusedClass Routed via attribute registration in Nextcloud runtime.
 */
class PublicNotesController extends PublicShareController
{
    private ?IShare $resolvedShare = null;

    private bool $shareResolved = false;

    public function __construct(
        string $appName,
        IRequest $request,
        ISession $session,
        private readonly ShareFileService $shareFileService,
        private readonly NotesService $notes,
    ) {
        parent::__construct($appName, $request, $session);
    }

    public function isValidToken(): bool
    {
        return $this->share() !== null;
    }

    protected function isPasswordProtected(): bool
    {
        $password = $this->share()?->getPassword();

        return $password !== null && $password !== '';
    }

    protected function getPasswordHash(): ?string
    {
        return $this->share()?->getPassword();
    }

    private function share(): ?IShare
    {
        if (!$this->shareResolved) {
            $this->resolvedShare = $this->shareFileService->findValidLinkShare($this->getToken());
            $this->shareResolved = true;
        }

        return $this->resolvedShare;
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[ApiRoute(verb: 'GET', url: '/public/notes/{token}/{fileId}')]
    public function index(string $token, int $fileId): JSONResponse
    {
        try {
            $file = $this->shareFileService->getFileFromShare($token, $fileId);
        } catch (NotFoundException|UnsupportedFileTypeException) {
            return new JSONResponse(['error' => 'Not found'], Http::STATUS_NOT_FOUND);
        }

        // Keyed by the id of the file the share actually resolved to, never the id the
        // caller sent: on a single-file share getFileFromShare() ignores that id.
        $notes = array_map(
            fn ($note) => $this->notes->serialize($note, false),
            $this->notes->list($file->getId()),
        );

        return new JSONResponse(['canEdit' => false, 'notes' => $notes]);
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `composer test:unit -- --filter PublicNotesControllerTest`
Expected: PASS (4 tests).

- [ ] **Step 5: Regenerate OpenAPI, then run the static checks**

Run: `composer run openapi && composer cs:fix && composer psalm`
Expected: the public notes route appears in `openapi.json`, and psalm reports no new errors.

- [ ] **Step 6: Commit**

```bash
git add lib/Controller/PublicNotesController.php tests/unit/Controller/PublicNotesControllerTest.php openapi.json
git commit -m "feat(notes): serve notes read-only on public links"
```

---

### Task 7: HTTP suite through Nextcloud's real middleware

**Files:**
- Create: `tests/phpunit.http.xml`
- Create: `tests/http/HttpTestCase.php`
- Create: `tests/http/NotesHttpTest.php`
- Modify: `composer.json` (add the `test:http` script)
- Modify: `.github/workflows/test-integration.yml` (start a web server; run `test:http` in both jobs)

**Interfaces:**
- Consumes: every route from Tasks 5 and 6; `NoteMapper` (Task 1).
- Produces: `composer test:http`, which requires the env var `TDV_HTTP_BASE` (for example `http://localhost:8080`) and fails loudly without it.

- [ ] **Step 1: Add the PHPUnit config and the composer script**

`tests/phpunit.http.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" bootstrap="integration/bootstrap.php" xsi:noNamespaceSchemaLocation="https://schema.phpunit.de/10.4/phpunit.xsd" cacheDirectory=".phpunit.http.cache">
	<testsuite name="Three D Viewer HTTP Tests">
		<directory suffix="Test.php">http</directory>
	</testsuite>
</phpunit>
```

In `composer.json` `scripts`, after `test:integration`, add:

```json
		"test:http": "phpunit -c tests/phpunit.http.xml --colors=always --fail-on-warning --fail-on-risky",
```

`composer.json` has no `autoload-dev` section, because test files are loaded by path. `NotesHttpTest.php` therefore `require_once`s its base class (Step 3).

- [ ] **Step 2: Write the base test case**

`tests/http/HttpTestCase.php`:

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Http;

use GuzzleHttp\Client;
use GuzzleHttp\Cookie\CookieJar;
use OCA\ThreeDViewer\Db\NoteMapper;
use OCP\Constants;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\IUserManager;
use OCP\Server;
use OCP\Share\IManager as ShareManager;
use OCP\Share\IShare;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;

/**
 * Real HTTP requests against a running server, so every request passes through the
 * middleware — the security middleware's CSRF check and PublicShareMiddleware's password
 * check — that calling a controller directly skips. The advisory GHSA-gjh8-x4wm-3cfj was
 * exactly a bug in that layer, invisible to any test that constructs the controller.
 *
 * The server and this process share one installation: users, files and shares made here
 * are what the server serves.
 */
abstract class HttpTestCase extends TestCase
{
    protected const PASSWORD = 'integration-suite-password-Aa1!';

    /** @var list<string> */
    private array $users = [];

    protected static function base(): string
    {
        $base = getenv('TDV_HTTP_BASE');
        if (!is_string($base) || $base === '') {
            // No skip: a suite that skips without a server reports coverage it lacks.
            self::fail('TDV_HTTP_BASE is not set; point it at a running server, e.g. http://localhost:8080');
        }

        return rtrim($base, '/');
    }

    protected function tearDown(): void
    {
        foreach ($this->users as $uid) {
            Server::get(IUserManager::class)->get($uid)?->delete();
        }
    }

    protected function newUser(): string
    {
        $uid = 'tdv-http-' . bin2hex(random_bytes(6));
        Server::get(IUserManager::class)->createUser($uid, self::PASSWORD);
        $this->users[] = $uid;

        return $uid;
    }

    protected function newModel(string $uid, string $name = 'model.stl'): File
    {
        return Server::get(IRootFolder::class)->getUserFolder($uid)->newFile($name, "solid t\nendsolid t\n");
    }

    protected function shareWithUser(File $file, string $owner, string $recipient, int $permissions): void
    {
        $manager = Server::get(ShareManager::class);
        $share = $manager->newShare();
        $share->setNode($file)
            ->setShareType(IShare::TYPE_USER)
            ->setSharedWith($recipient)
            ->setSharedBy($owner)
            ->setShareOwner($owner)
            ->setPermissions($permissions);
        $manager->createShare($share);
    }

    /** @return string the share token */
    protected function shareByLink(File $file, string $owner, ?string $password = null): string
    {
        $manager = Server::get(ShareManager::class);
        $share = $manager->newShare();
        $share->setNode($file)
            ->setShareType(IShare::TYPE_LINK)
            ->setSharedBy($owner)
            ->setShareOwner($owner)
            ->setPermissions(Constants::PERMISSION_READ);
        if ($password !== null) {
            $share->setPassword($password);
        }

        return $manager->createShare($share)->getToken();
    }

    /**
     * Basic auth with no cookies: Nextcloud skips the CSRF check for requests that carry no
     * session cookie, so this client tests authorisation alone.
     */
    protected function basic(string $uid): Client
    {
        return new Client([
            'base_uri' => self::base(),
            'auth' => [$uid, self::PASSWORD],
            'http_errors' => false,
            'allow_redirects' => false,
        ]);
    }

    protected function anonymous(): Client
    {
        return new Client(['base_uri' => self::base(), 'http_errors' => false, 'allow_redirects' => false]);
    }

    /**
     * A browser-like session: logged in through the login form, with cookies. Requests from
     * it are subject to the CSRF check, which is what the CSRF tests need.
     *
     * @return array{0: Client, 1: string} the client and a valid request token
     */
    protected function session(string $uid): array
    {
        $client = new Client([
            'base_uri' => self::base(),
            'cookies' => new CookieJar(),
            'http_errors' => false,
            'allow_redirects' => false,
        ]);

        $login = (string) $client->get('/index.php/login')->getBody();
        self::assertSame(1, preg_match('/data-requesttoken="([^"]+)"/', $login, $match), 'login page carries a request token');
        $client->post('/index.php/login', ['form_params' => [
            'user' => $uid,
            'password' => self::PASSWORD,
            'requesttoken' => html_entity_decode($match[1]),
            'timezone' => 'UTC',
            'timezone_offset' => '0',
        ]]);

        $token = json_decode((string) $client->get('/index.php/csrftoken')->getBody(), true)['token'] ?? null;
        self::assertIsString($token, 'logged in and received a CSRF token');

        return [$client, $token];
    }

    protected static function notesUrl(int $fileId, ?int $noteId = null): string
    {
        return '/index.php/apps/threedviewer/api/notes/' . $fileId . ($noteId === null ? '' : '/' . $noteId);
    }

    protected static function publicNotesUrl(string $token, int $fileId): string
    {
        return '/ocs/v2.php/apps/threedviewer/public/notes/' . $token . '/' . $fileId;
    }

    /** @return array<string, mixed> */
    protected static function annotation(string $text): array
    {
        return ['type' => 'annotation', 'payload' => ['space' => 'model', 'point' => ['x' => 1, 'y' => 2, 'z' => 3], 'text' => $text]];
    }

    /** @return array<string, mixed>|null */
    protected static function json(ResponseInterface $response): ?array
    {
        $data = json_decode((string) $response->getBody(), true);

        return is_array($data) ? $data : null;
    }

    protected static function noteCount(int $fileId): int
    {
        return Server::get(NoteMapper::class)->countByFile($fileId);
    }
}
```

- [ ] **Step 3: Write the HTTP tests**

`tests/http/NotesHttpTest.php`:

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Http;

require_once __DIR__ . '/HttpTestCase.php';

use GuzzleHttp\Promise\Utils;
use OCP\Constants;
use OCP\Files\IAppData;
use OCP\Files\AppData\IAppDataFactory;
use OCP\Server;

class NotesHttpTest extends HttpTestCase
{
    public function testEditorCreatesAndARecipientSeesIt(): void
    {
        $owner = $this->newUser();
        $reader = $this->newUser();
        $model = $this->newModel($owner);
        $this->shareWithUser($model, $owner, $reader, Constants::PERMISSION_READ);

        $created = $this->basic($owner)->post(self::notesUrl($model->getId()), ['json' => self::annotation('Hole')]);
        $this->assertSame(201, $created->getStatusCode());

        $seen = self::json($this->basic($reader)->get(self::notesUrl($model->getId())));
        $this->assertFalse($seen['canEdit']);
        $this->assertSame('Hole', $seen['notes'][0]['payload']['text']);
        $this->assertSame($owner, $seen['notes'][0]['author']['uid']);
    }

    public function testReadOnlyRecipientCannotWrite(): void
    {
        $owner = $this->newUser();
        $reader = $this->newUser();
        $model = $this->newModel($owner);
        $this->shareWithUser($model, $owner, $reader, Constants::PERMISSION_READ);
        $noteId = self::json($this->basic($owner)->post(self::notesUrl($model->getId()), ['json' => self::annotation('Keep')]))['id'];

        $client = $this->basic($reader);
        $this->assertSame(403, $client->post(self::notesUrl($model->getId()), ['json' => self::annotation('No')])->getStatusCode());
        $this->assertSame(403, $client->patch(self::notesUrl($model->getId(), $noteId), ['json' => ['payload' => self::annotation('No')['payload']]])->getStatusCode());
        $this->assertSame(403, $client->delete(self::notesUrl($model->getId(), $noteId))->getStatusCode());
        $this->assertSame(1, self::noteCount($model->getId()));
    }

    public function testRecipientWithEditRightsCanEditAnyonesNote(): void
    {
        $owner = $this->newUser();
        $editor = $this->newUser();
        $model = $this->newModel($owner);
        $this->shareWithUser($model, $owner, $editor, Constants::PERMISSION_READ | Constants::PERMISSION_UPDATE);
        $noteId = self::json($this->basic($owner)->post(self::notesUrl($model->getId()), ['json' => self::annotation('Old')]))['id'];

        $response = $this->basic($editor)->patch(self::notesUrl($model->getId(), $noteId), ['json' => ['payload' => self::annotation('New')['payload']]]);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('New', self::json($response)['payload']['text']);
    }

    public function testAStrangerGets404NotForbidden(): void
    {
        $owner = $this->newUser();
        $stranger = $this->newUser();
        $model = $this->newModel($owner);

        $client = $this->basic($stranger);
        $this->assertSame(404, $client->get(self::notesUrl($model->getId()))->getStatusCode());
        $this->assertSame(404, $client->post(self::notesUrl($model->getId()), ['json' => self::annotation('x')])->getStatusCode());
    }

    public function testASessionWriteWithoutTheRequestTokenIsRejected(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        [$client, $token] = $this->session($owner);

        $without = $client->post(self::notesUrl($model->getId()), ['json' => self::annotation('Forged')]);
        $with = $client->post(self::notesUrl($model->getId()), ['json' => self::annotation('Real'), 'headers' => ['requesttoken' => $token]]);

        $this->assertNotSame(201, $without->getStatusCode(), 'CSRF check must reject a token-less write');
        $this->assertSame(201, $with->getStatusCode(), 'the same session with its token is accepted, so the rejection was the token');
        $this->assertSame(1, self::noteCount($model->getId()));
    }

    /** The read migrates private annotations into the shared set, so it needs the token too. */
    public function testASessionReadWithoutTheRequestTokenIsRejected(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        [$client] = $this->session($owner);

        $this->assertNotSame(200, $client->get(self::notesUrl($model->getId()))->getStatusCode());
    }

    public function testAPasswordProtectedLinkWithoutThePasswordReturnsNoNotes(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $this->basic($owner)->post(self::notesUrl($model->getId()), ['json' => self::annotation('Secret-9f2c')]);
        $token = $this->shareByLink($model, $owner, 'link-password-Aa1!');

        $response = $this->anonymous()->get(self::publicNotesUrl($token, $model->getId()), ['headers' => ['OCS-APIRequest' => 'true']]);

        $this->assertNotSame(200, $response->getStatusCode());
        $this->assertStringNotContainsString('Secret-9f2c', (string) $response->getBody());
    }

    public function testAPublicLinkShowsNotesWithoutAuthors(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $this->basic($owner)->post(self::notesUrl($model->getId()), ['json' => self::annotation('Visible')]);
        $token = $this->shareByLink($model, $owner);

        $body = self::json($this->anonymous()->get(self::publicNotesUrl($token, $model->getId()), ['headers' => ['OCS-APIRequest' => 'true']]));

        $this->assertFalse($body['canEdit']);
        $this->assertSame('Visible', $body['notes'][0]['payload']['text']);
        $this->assertNull($body['notes'][0]['author']);
        $this->assertStringNotContainsString($owner, json_encode($body));
    }

    public function testNoWriteReachesNotesThroughAPublicLink(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $token = $this->shareByLink($model, $owner);
        $client = $this->anonymous();
        $url = self::publicNotesUrl($token, $model->getId());
        $headers = ['OCS-APIRequest' => 'true'];

        foreach (['POST', 'PATCH', 'PUT', 'DELETE'] as $method) {
            $status = $client->request($method, $url, ['json' => self::annotation('x'), 'headers' => $headers])->getStatusCode();
            $this->assertGreaterThanOrEqual(400, $status, "$method on the public route must fail");
        }
        $this->assertSame(0, self::noteCount($model->getId()));
    }

    public function testLegacyAnnotationsMoveOnceForAnEditor(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $this->writeLegacy($owner, $model->getId(), ['A', 'B']);

        $first = self::json($this->basic($owner)->get(self::notesUrl($model->getId())));
        $second = self::json($this->basic($owner)->get(self::notesUrl($model->getId())));

        $this->assertCount(2, $first['notes']);
        $this->assertSame('scene', $first['notes'][0]['payload']['space']);
        $this->assertCount(2, $second['notes'], 'a second open finds nothing left to move');
        $this->assertFalse($this->legacyExists($owner, $model->getId()));
    }

    public function testLegacyAnnotationsStayPrivateForAReadOnlyUser(): void
    {
        $owner = $this->newUser();
        $reader = $this->newUser();
        $model = $this->newModel($owner);
        $this->shareWithUser($model, $owner, $reader, Constants::PERMISSION_READ);
        $this->writeLegacy($reader, $model->getId(), ['Mine']);

        $body = self::json($this->basic($reader)->get(self::notesUrl($model->getId())));

        $this->assertSame([], $body['notes']);
        $this->assertSame('Mine', $body['private'][0]['payload']['text']);
        $this->assertTrue($this->legacyExists($reader, $model->getId()));
        $this->assertSame([], self::json($this->basic($owner)->get(self::notesUrl($model->getId())))['notes'], 'the owner never sees them');
    }

    /** Review focus: two tabs opening the model at once. */
    public function testParallelFirstOpensMigrateOnce(): void
    {
        $owner = $this->newUser();
        $model = $this->newModel($owner);
        $this->writeLegacy($owner, $model->getId(), ['A', 'B', 'C']);
        $client = $this->basic($owner);

        Utils::unwrap([
            $client->getAsync(self::notesUrl($model->getId())),
            $client->getAsync(self::notesUrl($model->getId())),
            $client->getAsync(self::notesUrl($model->getId())),
        ]);

        $this->assertSame(3, self::noteCount($model->getId()));
    }

    /** @param list<string> $texts */
    private function writeLegacy(string $uid, int $fileId, array $texts): void
    {
        $annotations = [];
        foreach ($texts as $i => $text) {
            $annotations[] = ['id' => $i, 'point' => ['x' => $i, 'y' => 0, 'z' => 0], 'text' => $text, 'timestamp' => '2026-01-01T00:00:00Z'];
        }
        $appData = $this->appData();
        try {
            $root = $appData->getFolder('annotations');
        } catch (\OCP\Files\NotFoundException) {
            $root = $appData->newFolder('annotations');
        }
        try {
            $folder = $root->getFolder($uid);
        } catch (\OCP\Files\NotFoundException) {
            $folder = $root->newFolder($uid);
        }
        $folder->newFile($fileId . '.json', json_encode(['format' => 'threedviewer-annotations', 'version' => 1, 'annotations' => $annotations]));
    }

    private function legacyExists(string $uid, int $fileId): bool
    {
        try {
            return $this->appData()->getFolder('annotations')->getFolder($uid)->fileExists($fileId . '.json');
        } catch (\OCP\Files\NotFoundException) {
            return false;
        }
    }

    private function appData(): IAppData
    {
        return Server::get(IAppDataFactory::class)->get('threedviewer');
    }
}
```

`php -S` is single-threaded, so the three "parallel" requests in `testParallelFirstOpensMigrateOnce` are served one after another. The test still proves that repeated opens migrate exactly once, and the lock is covered by `NotesServiceTest::testMigrationSkipsWhenAnotherRequestHoldsTheLock`. Say so in a comment above the test:

```php
    // php -S serves these one at a time, so this pins "repeated opens migrate once"; the
    // lock that covers truly simultaneous opens is pinned in NotesServiceTest.
```

- [ ] **Step 4: Wire the web server and the suite into CI**

In `.github/workflows/test-integration.yml`, in **both** the `integration-tests` and `database-tests` jobs, replace the `Run integration tests` step with:

```yaml
      # The HTTP suite needs requests to pass through the server's middleware — the CSRF
      # check and PublicShareMiddleware's password check — which calling a controller
      # directly never does. PHP's built-in server is enough for that.
      - name: Start a web server
        run: |
          php occ config:system:set trusted_domains 1 --value=localhost:8080
          php -S localhost:8080 > /tmp/php-server.log 2>&1 &
          for i in $(seq 1 30); do
            curl -fsS http://localhost:8080/status.php > /dev/null && exit 0
            sleep 1
          done
          cat /tmp/php-server.log
          exit 1

      - name: Run integration tests
        working-directory: apps/threedviewer
        run: composer test:integration

      - name: Run HTTP tests
        working-directory: apps/threedviewer
        env:
          TDV_HTTP_BASE: http://localhost:8080
        run: composer test:http

      - name: Show web server log on failure
        if: failure()
        run: cat /tmp/php-server.log
```

- [ ] **Step 5: Run the suite locally against the dev container (optional) or push the branch for CI**

Local: with the dev container serving on `http://localhost:8080` and the app mounted at `custom_apps` (see memory: never mount the worktree into the image), run `TDV_HTTP_BASE=http://localhost:8080 composer test:http` from the app directory inside the container.
Expected: 12 tests pass. If `session()` fails to find `data-requesttoken`, print the first 2 KB of the login page and adjust the regex to the server version's markup. Don't weaken the CSRF assertions.

- [ ] **Step 6: Commit**

```bash
git add tests/phpunit.http.xml tests/http composer.json .github/workflows/test-integration.yml
git commit -m "test(notes): check note access through the real middleware over HTTP"
```

---

### Task 8: Daily orphan cleanup

**Files:**
- Create: `lib/Cron/CleanupOrphanNotes.php`
- Modify: `appinfo/info.xml:83-85`
- Test: `tests/integration/NoteMapperTest.php` (add a trash test)

**Interfaces:**
- Consumes: `NoteMapper::deleteOrphans(): int` (Task 1).
- Produces: `OCA\ThreeDViewer\Cron\CleanupOrphanNotes`, a `TimedJob` with an interval of 86400.

- [ ] **Step 1: Write the failing integration test**

Add to `tests/integration/NoteMapperTest.php`:

```php
    /** A model in the trash is restorable, so its notes must survive the cleanup. */
    public function testDeleteOrphansKeepsNotesOfATrashedFile(): void
    {
        $home = Server::get(IRootFolder::class)->getUserFolder($this->uid);
        $trashed = $home->newFile('trashed.stl', 'solid y');
        $trashedId = $trashed->getId();
        $note = $this->insert($trashedId, 'survives');
        $trashed->delete();

        $this->mapper->deleteOrphans();

        $this->assertSame($note->getId(), $this->mapper->findInFile($trashedId, $note->getId())->getId());
        $this->mapper->delete($note);
    }
```

In CI the files_trashbin app is enabled by default, so `delete()` moves the file to the trash and keeps its filecache row. If the dev container has trashbin disabled, run `php occ app:enable files_trashbin` first.

- [ ] **Step 2: Write the job and register it**

`lib/Cron/CleanupOrphanNotes.php`:

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Cron;

use OCA\ThreeDViewer\Db\NoteMapper;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\TimedJob;
use Psr\Log\LoggerInterface;

/**
 * Removes notes whose model has been permanently deleted.
 */
class CleanupOrphanNotes extends TimedJob
{
    public function __construct(
        ITimeFactory $time,
        private readonly NoteMapper $mapper,
        private readonly LoggerInterface $logger,
    ) {
        parent::__construct($time);
        $this->setInterval(86400);
        $this->setTimeSensitivity(self::TIME_INSENSITIVE);
    }

    protected function run($argument): void
    {
        $deleted = $this->mapper->deleteOrphans();
        if ($deleted > 0) {
            $this->logger->info('3D Viewer removed notes of deleted models', ['notes' => $deleted]);
        }
    }
}
```

In `appinfo/info.xml`, change the background-jobs block to:

```xml
	<background-jobs>
		<job>OCA\ThreeDViewer\Cron\CleanupTempFiles</job>
		<job>OCA\ThreeDViewer\Cron\CleanupOrphanNotes</job>
	</background-jobs>
```

- [ ] **Step 3: Run the checks**

Run: `composer test:unit && composer lint && composer psalm`
Expected: green. The `lint-info-xml` workflow validates `info.xml` in CI.

- [ ] **Step 4: Commit**

```bash
git add lib/Cron/CleanupOrphanNotes.php appinfo/info.xml tests/integration/NoteMapperTest.php
git commit -m "feat(notes): remove notes of permanently deleted models daily"
```

---

### Task 9: Frontend coordinate helpers and API client

**Files:**
- Create: `src/utils/noteSpace.js`
- Create: `src/utils/notesApi.js`
- Test: `tests/unit/utils/noteSpace.test.js`
- Test: `tests/unit/utils/notesApi.test.js`

**Interfaces:**
- Produces (noteSpace):
  - `toPlain(v): {x,y,z}`
  - `sceneToModel(point, modelRoot): {x,y,z}`
  - `modelToScene(point, modelRoot): THREE.Vector3`
  - `pointToScene(point, space, modelRoot): THREE.Vector3`: for `space === 'scene'`, or when `modelRoot` is null, it returns the point unchanged as a Vector3.
- Produces (notesApi): `createNotesApi({ fileId, shareToken = null })` returning:
  - `readOnly: boolean`
  - `list(): Promise<{canEdit, notes, private}>`
  - `create(type, payload): Promise<Note>`
  - `update(noteId, payload): Promise<Note>`
  - `remove(noteId): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`tests/unit/utils/noteSpace.test.js`:

```js
const THREE = require('three')
const { sceneToModel, modelToScene, pointToScene, toPlain } = require('../../../src/utils/noteSpace.js')

function placedRoot() {
	// The same kind of placement the viewer applies on load: moved so the model sits
	// centred on the grid, plus a scale, so a missing inverse would show.
	const root = new THREE.Group()
	root.position.set(-4, 1.5, 2)
	root.scale.set(2, 2, 2)
	return root
}

test('a point survives scene → model → scene', () => {
	const root = placedRoot()
	const scene = new THREE.Vector3(3, -2, 7)

	const back = modelToScene(sceneToModel(scene, root), root)

	expect(back.x).toBeCloseTo(3)
	expect(back.y).toBeCloseTo(-2)
	expect(back.z).toBeCloseTo(7)
})

test('model space is independent of where the model was placed', () => {
	const root = placedRoot()
	const local = sceneToModel(new THREE.Vector3(-4, 1.5, 2), root)

	expect(local).toEqual({ x: 0, y: 0, z: 0 })
})

test('scene-space points and a missing root pass through unchanged', () => {
	const p = { x: 1, y: 2, z: 3 }

	expect(toPlain(pointToScene(p, 'scene', placedRoot()))).toEqual(p)
	expect(toPlain(pointToScene(p, 'model', null))).toEqual(p)
})
```

`tests/unit/utils/notesApi.test.js`:

```js
jest.mock('@nextcloud/axios', () => ({
	__esModule: true,
	default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}))
jest.mock('@nextcloud/router', () => ({
	generateUrl: (url, params = {}) => '/index.php' + url.replace(/{(\w+)}/g, (_, k) => params[k]),
	generateOcsUrl: (url, params = {}) => '/ocs/v2.php/' + url.replace(/{(\w+)}/g, (_, k) => params[k]),
}))

const axios = require('@nextcloud/axios').default
const { createNotesApi } = require('../../../src/utils/notesApi.js')

beforeEach(() => jest.clearAllMocks())

test('signed in: lists, creates, updates and deletes on the notes route', async () => {
	axios.get.mockResolvedValue({ data: { canEdit: true, notes: [{ id: 1 }], private: [] } })
	axios.post.mockResolvedValue({ data: { id: 2 } })
	axios.patch.mockResolvedValue({ data: { id: 2 } })
	axios.delete.mockResolvedValue({})
	const api = createNotesApi({ fileId: 7 })

	expect(await api.list()).toEqual({ canEdit: true, notes: [{ id: 1 }], private: [] })
	await api.create('annotation', { a: 1 })
	await api.update(2, { b: 1 })
	await api.remove(2)

	expect(axios.get).toHaveBeenCalledWith('/index.php/apps/threedviewer/api/notes/7')
	expect(axios.post).toHaveBeenCalledWith('/index.php/apps/threedviewer/api/notes/7', { type: 'annotation', payload: { a: 1 } })
	expect(axios.patch).toHaveBeenCalledWith('/index.php/apps/threedviewer/api/notes/7/2', { payload: { b: 1 } })
	expect(axios.delete).toHaveBeenCalledWith('/index.php/apps/threedviewer/api/notes/7/2')
})

test('public link: reads the public route and refuses every write', async () => {
	axios.get.mockResolvedValue({ data: { canEdit: false, notes: [{ id: 1 }] } })
	const api = createNotesApi({ fileId: 7, shareToken: 'tok' })

	expect(api.readOnly).toBe(true)
	expect(await api.list()).toEqual({ canEdit: false, notes: [{ id: 1 }], private: [] })
	expect(axios.get).toHaveBeenCalledWith('/ocs/v2.php/apps/threedviewer/public/notes/tok/7', { headers: { 'OCS-APIRequest': 'true' } })
	await expect(api.create('annotation', {})).rejects.toThrow('read-only')
	expect(axios.post).not.toHaveBeenCalled()
})

test('a malformed list response still yields arrays', async () => {
	axios.get.mockResolvedValue({ data: {} })

	expect(await createNotesApi({ fileId: 7 }).list()).toEqual({ canEdit: false, notes: [], private: [] })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/unit/utils/noteSpace.test.js tests/unit/utils/notesApi.test.js`
Expected: FAIL with `Cannot find module '../../../src/utils/noteSpace.js'`.

- [ ] **Step 3: Write the modules**

`src/utils/noteSpace.js`:

```js
/**
 * Converting note points between the scene and the model.
 *
 * Notes are stored relative to the model root, not the scene: the viewer moves the model
 * on every load to centre it on the grid, and a scene position is only right for as long
 * as that placement never changes. A model-space point is right wherever the model is put.
 */

import * as THREE from 'three'

/**
 * @param {{x: number, y: number, z: number}} v - any point-like object
 * @return {{x: number, y: number, z: number}} a plain, serialisable copy
 */
export function toPlain(v) {
	return { x: v.x, y: v.y, z: v.z }
}

/**
 * @param {{x: number, y: number, z: number}} point - scene (world) position
 * @param {THREE.Object3D} modelRoot - the loaded model's root
 * @return {{x: number, y: number, z: number}} the same position in model space
 */
export function sceneToModel(point, modelRoot) {
	modelRoot.updateMatrixWorld(true)
	return toPlain(modelRoot.worldToLocal(new THREE.Vector3(point.x, point.y, point.z)))
}

/**
 * @param {{x: number, y: number, z: number}} point - model-space position
 * @param {THREE.Object3D} modelRoot - the loaded model's root
 * @return {THREE.Vector3} the same position in the scene
 */
export function modelToScene(point, modelRoot) {
	modelRoot.updateMatrixWorld(true)
	return modelRoot.localToWorld(new THREE.Vector3(point.x, point.y, point.z))
}

/**
 * @param {{x: number, y: number, z: number}} point - a stored note point
 * @param {'model'|'scene'} space - the space it was stored in
 * @param {?THREE.Object3D} modelRoot - the loaded model's root, if any
 * @return {THREE.Vector3} the position to draw at
 */
export function pointToScene(point, space, modelRoot) {
	if (space === 'scene' || !modelRoot) {
		return new THREE.Vector3(point.x, point.y, point.z)
	}
	return modelToScene(point, modelRoot)
}
```

`src/utils/notesApi.js`:

```js
/**
 * The notes routes, signed in and on a public link.
 *
 * `@nextcloud/axios` attaches the request token, which every signed-in notes route
 * requires — the read as well, because it runs the migration of private annotations.
 */

import axios from '@nextcloud/axios'
import { generateOcsUrl, generateUrl } from '@nextcloud/router'

/**
 * @param {object} options
 * @param {number|string} options.fileId - the model's file id
 * @param {?string} [options.shareToken] - set on a public share page
 * @return {object} the API client
 */
export function createNotesApi({ fileId, shareToken = null }) {
	const base = generateUrl('/apps/threedviewer/api/notes/{fileId}', { fileId })
	const readOnly = shareToken !== null

	const refuseOnPublicLink = () => {
		if (readOnly) {
			throw new Error('Notes are read-only on a public link')
		}
	}

	return {
		readOnly,

		async list() {
			if (readOnly) {
				const url = generateOcsUrl('apps/threedviewer/public/notes/{token}/{fileId}', { token: shareToken, fileId })
				const { data } = await axios.get(url, { headers: { 'OCS-APIRequest': 'true' } })
				return { canEdit: false, notes: Array.isArray(data?.notes) ? data.notes : [], private: [] }
			}
			const { data } = await axios.get(base)
			return {
				canEdit: data?.canEdit === true,
				notes: Array.isArray(data?.notes) ? data.notes : [],
				private: Array.isArray(data?.private) ? data.private : [],
			}
		},

		async create(type, payload) {
			refuseOnPublicLink()
			const { data } = await axios.post(base, { type, payload })
			return data
		},

		async update(noteId, payload) {
			refuseOnPublicLink()
			const { data } = await axios.patch(`${base}/${noteId}`, { payload })
			return data
		},

		async remove(noteId) {
			refuseOnPublicLink()
			await axios.delete(`${base}/${noteId}`)
		},
	}
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/utils/noteSpace.test.js tests/unit/utils/notesApi.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/noteSpace.js src/utils/notesApi.js tests/unit/utils/noteSpace.test.js tests/unit/utils/notesApi.test.js
git commit -m "feat(notes): add note coordinate helpers and API client"
```

---

### Task 10: `useSharedNotes` composable

**Files:**
- Create: `src/composables/useSharedNotes.js`
- Test: `tests/unit/composables/useSharedNotes.test.js`

**Interfaces:**
- Consumes: `pointToScene`, `sceneToModel` (Task 9). It also calls, on its `annotation` and `measurement` arguments, the methods Task 11 adds:
  - `annotation.setCanAdd(bool)`
  - `annotation.addAnnotationFromNote(point: Vector3, text: string, meta): item`
  - `annotation.deleteAnnotation(id, { silent: true })`
  - `annotation.clearAllAnnotations({ silent: true })`
  - `annotation.setNoteHooks(hooks)`
  - `measurement.addMeasurementFromNote(p1: Vector3, p2: Vector3, meta): item`
  - `measurement.deleteMeasurement(id, { silent: true })`
  - `measurement.clearAllMeasurements({ silent: true })`
  - `measurement.setNoteHooks(hooks)`
- Hooks passed to `setNoteHooks`: `{ added(item), changed(item), deleted(item) }`. `item` is the reactive list entry. Annotations have `{ id, point, text, meta }`; measurements have `{ id, point1, point2, meta }`.
- `meta` shape: `{ noteId: ?number, author: ?{uid, displayName}, saveState: 'new'|'saving'|'saved'|'shared'|'failed'|'local'|'private', deleted?: boolean }`.
- Produces: `useSharedNotes({ annotation, measurement, getModelRoot, notify, t })` returning:
  - `status: Readonly<Ref<'idle'|'loading'|'saving'|'saved'|'error'|'readonly'>>`
  - `canEdit: Readonly<Ref<boolean>>`
  - `load(api): Promise<void>`
  - `retry(kind, item): Promise<void>`
  - `discard(kind, item): void`
  - `flush(): Promise<void>`, which saves pending text edits now; used by tests and on unmount.
- Produces: `export const TEXT_SAVE_DEBOUNCE_MS = 600`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/composables/useSharedNotes.test.js`:

```js
const THREE = require('three')
const { reactive } = require('vue')
const { useSharedNotes, TEXT_SAVE_DEBOUNCE_MS } = require('../../../src/composables/useSharedNotes.js')

/*
 * Stand-ins for useAnnotation / useMeasurement that behave like the real list: items
 * live in a reactive array, hooks fire on user actions, and the note entry points and
 * `silent` options never fire hooks.
 */
function fakeTool(kind) {
	let hooks = {}
	let seq = 0
	const items = reactive([])
	const make = (fields, meta) => {
		items.push({ id: `${kind}-${++seq}`, ...fields, meta: meta ?? { noteId: null, author: null, saveState: 'new' } })
		return items[items.length - 1]
	}
	const remove = (id, { silent = false } = {}) => {
		const i = items.findIndex(x => x.id === id)
		if (i === -1) return
		if (!silent) hooks.deleted?.(items[i])
		items.splice(i, 1)
	}
	return {
		items,
		canAdd: true,
		setCanAdd(v) { this.canAdd = v },
		setNoteHooks: (h) => { hooks = h },
		addAnnotationFromNote: (point, text, meta) => make({ point, text }, meta),
		addMeasurementFromNote: (p1, p2, meta) => make({ point1: p1, point2: p2 }, meta),
		userAdd: (fields) => { const item = make(fields); hooks.added?.(item); return item },
		userEditText: (item, text) => { item.text = text; hooks.changed?.(item) },
		deleteAnnotation: remove,
		deleteMeasurement: remove,
		userDelete: (item) => remove(item.id),
		clearAllAnnotations: ({ silent = false } = {}) => { [...items].forEach(i => remove(i.id, { silent })) },
		clearAllMeasurements: ({ silent = false } = {}) => { [...items].forEach(i => remove(i.id, { silent })) },
	}
}

function fakeApi(overrides = {}) {
	let next = 100
	return {
		readOnly: false,
		list: jest.fn().mockResolvedValue({ canEdit: true, notes: [], private: [] }),
		create: jest.fn().mockImplementation(async () => ({ id: next++, author: { uid: 'alice', displayName: 'Alice' } })),
		update: jest.fn().mockResolvedValue({}),
		remove: jest.fn().mockResolvedValue(undefined),
		...overrides,
	}
}

function setup() {
	const annotation = fakeTool('a')
	const measurement = fakeTool('m')
	const notify = jest.fn()
	const root = new THREE.Group()
	root.position.set(10, 0, 0)
	const notes = useSharedNotes({ annotation, measurement, getModelRoot: () => root, notify })
	return { annotation, measurement, notify, root, notes }
}

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0))

beforeEach(() => jest.useRealTimers())

test('load draws shared notes in scene space and reports edit rights', async () => {
	const { annotation, measurement, notes } = setup()
	const api = fakeApi({
		list: jest.fn().mockResolvedValue({
			canEdit: false,
			notes: [
				{ id: 1, type: 'annotation', payload: { space: 'model', point: { x: 1, y: 0, z: 0 }, text: 'Hole' }, author: { uid: 'bob', displayName: 'Bob' } },
				{ id: 2, type: 'measurement', payload: { space: 'model', points: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }] }, author: null },
			],
			private: [],
		}),
	})

	await notes.load(api)

	expect(annotation.items[0].point.x).toBeCloseTo(11)
	expect(annotation.items[0].meta).toMatchObject({ noteId: 1, saveState: 'shared', author: { displayName: 'Bob' } })
	expect(measurement.items[0].point2.y).toBeCloseTo(1)
	expect(annotation.canAdd).toBe(false)
	expect(notes.canEdit.value).toBe(false)
	expect(notes.status.value).toBe('readonly')
})

test('private legacy notes are drawn but marked private', async () => {
	const { annotation, notes } = setup()
	await notes.load(fakeApi({
		list: jest.fn().mockResolvedValue({
			canEdit: false,
			notes: [],
			private: [{ id: 'private-0', type: 'annotation', payload: { space: 'scene', point: { x: 1, y: 2, z: 3 }, text: 'Mine' }, author: null }],
		}),
	}))

	expect(annotation.items[0].meta.saveState).toBe('private')
	expect(annotation.items[0].point.x).toBe(1)
})

test('scene-space shared notes are converted once when the user can edit', async () => {
	const { notes } = setup()
	const api = fakeApi({
		list: jest.fn().mockResolvedValue({
			canEdit: true,
			notes: [{ id: 5, type: 'annotation', payload: { space: 'scene', point: { x: 12, y: 0, z: 0 }, text: 'Old' }, author: null }],
			private: [],
		}),
	})

	await notes.load(api)
	await flushPromises()

	expect(api.update).toHaveBeenCalledTimes(1)
	expect(api.update).toHaveBeenCalledWith(5, { space: 'model', point: { x: 2, y: 0, z: 0 }, text: 'Old' })
})

/** Review focus: switching models clears the old notes locally, never on the server. */
test('load() clears previous notes silently', async () => {
	const { annotation, notes } = setup()
	const api = fakeApi()
	await notes.load(api)
	annotation.userAdd({ point: new THREE.Vector3(), text: 'x' })
	await flushPromises()

	await notes.load(fakeApi())

	expect(annotation.items).toHaveLength(0)
	expect(api.remove).not.toHaveBeenCalled()
})

test('an added annotation is saved in model space and takes the server id', async () => {
	const { annotation, notes } = setup()
	const api = fakeApi()
	await notes.load(api)

	const item = annotation.userAdd({ point: new THREE.Vector3(11, 0, 0), text: 'Note' })
	expect(item.meta.saveState).toBe('saving')
	await flushPromises()

	expect(api.create).toHaveBeenCalledWith('annotation', { space: 'model', point: { x: 1, y: 0, z: 0 }, text: 'Note' })
	expect(item.meta).toMatchObject({ noteId: 100, saveState: 'saved', author: { displayName: 'Alice' } })
})

test('a failed save is marked failed, notifies, and retry saves it', async () => {
	const { measurement, notes, notify } = setup()
	const api = fakeApi({ create: jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ id: 7, author: null }) })
	await notes.load(api)

	const item = measurement.userAdd({ point1: new THREE.Vector3(10, 0, 0), point2: new THREE.Vector3(10, 1, 0) })
	await flushPromises()

	expect(item.meta.saveState).toBe('failed')
	expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }))

	await notes.retry('measurement', item)

	expect(api.create).toHaveBeenLastCalledWith('measurement', { space: 'model', points: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }] })
	expect(item.meta).toMatchObject({ noteId: 7, saveState: 'saved' })
})

test('discard removes a never-saved note locally only', async () => {
	const { annotation, notes } = setup()
	const api = fakeApi({ create: jest.fn().mockRejectedValue(new Error('offline')) })
	await notes.load(api)
	const item = annotation.userAdd({ point: new THREE.Vector3(), text: 'x' })
	await flushPromises()

	notes.discard('annotation', item)

	expect(annotation.items).toHaveLength(0)
	expect(api.remove).not.toHaveBeenCalled()
})

test('text edits are saved once, after typing stops', async () => {
	const { annotation, notes } = setup()
	const api = fakeApi()
	await notes.load(api)
	const item = annotation.userAdd({ point: new THREE.Vector3(10, 0, 0), text: 'A' })
	await flushPromises() // real timers: let the first save finish and hand back its id

	jest.useFakeTimers()
	annotation.userEditText(item, 'Ab')
	annotation.userEditText(item, 'Abc')
	jest.advanceTimersByTime(TEXT_SAVE_DEBOUNCE_MS - 1)
	expect(api.update).not.toHaveBeenCalled()
	jest.advanceTimersByTime(1)
	jest.useRealTimers()
	await flushPromises()

	expect(api.update).toHaveBeenCalledTimes(1)
	expect(api.update).toHaveBeenCalledWith(100, { space: 'model', point: { x: 0, y: 0, z: 0 }, text: 'Abc' })
})

/** Review focus: typing before the first save answers must not lose the text. */
test('text typed during the first save is sent afterwards', async () => {
	let resolveCreate
	const api = fakeApi({ create: jest.fn(() => new Promise(r => { resolveCreate = r })) })
	const { annotation, notes } = setup()
	await notes.load(api)
	const item = annotation.userAdd({ point: new THREE.Vector3(10, 0, 0), text: 'A' })

	annotation.userEditText(item, 'Typed early')
	resolveCreate({ id: 55, author: null })
	await flushPromises()
	await notes.flush()

	expect(api.update).toHaveBeenCalledWith(55, expect.objectContaining({ text: 'Typed early' }))
})

/** Review focus: deleting mid-save must not leave an orphan on the server. */
test('delete during save removes the note once the server answers', async () => {
	let resolveCreate
	const api = fakeApi({ create: jest.fn(() => new Promise(r => { resolveCreate = r })) })
	const { annotation, notes } = setup()
	await notes.load(api)
	const item = annotation.userAdd({ point: new THREE.Vector3(), text: 'x' })

	annotation.userDelete(item)
	resolveCreate({ id: 77, author: null })
	await flushPromises()

	expect(api.remove).toHaveBeenCalledWith(77)
})

test('a saved note is deleted on the server', async () => {
	const { annotation, notes } = setup()
	const api = fakeApi()
	await notes.load(api)
	const item = annotation.userAdd({ point: new THREE.Vector3(), text: 'x' })
	await flushPromises()

	annotation.userDelete(item)
	await flushPromises()

	expect(api.remove).toHaveBeenCalledWith(100)
})

test('read-only: a new measurement stays local and nothing is sent', async () => {
	const { measurement, notes } = setup()
	const api = fakeApi({ list: jest.fn().mockResolvedValue({ canEdit: false, notes: [], private: [] }) })
	await notes.load(api)

	const item = measurement.userAdd({ point1: new THREE.Vector3(), point2: new THREE.Vector3(1, 0, 0) })
	await flushPromises()

	expect(item.meta.saveState).toBe('local')
	expect(api.create).not.toHaveBeenCalled()
})

test('a failed load reports an error and leaves the tools usable', async () => {
	const { notes } = setup()

	await notes.load(fakeApi({ list: jest.fn().mockRejectedValue(new Error('500')) }))

	expect(notes.status.value).toBe('error')
	expect(notes.canEdit.value).toBe(false)
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/unit/composables/useSharedNotes.test.js`
Expected: FAIL with `Cannot find module '../../../src/composables/useSharedNotes.js'`.

- [ ] **Step 3: Write the composable**

`src/composables/useSharedNotes.js`:

```js
/**
 * Shared annotations and measurements: loading them, and saving each change.
 *
 * useAnnotation and useMeasurement draw and edit; this composable is the only thing that
 * talks to the server. Each note is saved on its own — add, edit, delete — so two people
 * editing the same model never overwrite each other.
 */

import { ref, readonly } from 'vue'
import { pointToScene, sceneToModel, toPlain } from '../utils/noteSpace.js'
import { logger } from '../utils/logger.js'

export const TEXT_SAVE_DEBOUNCE_MS = 600

const fallbackT = (_app, text, vars = {}) => text.replace(/{(\w+)}/g, (_, k) => String(vars[k] ?? ''))

/**
 * @param {object} deps
 * @param {object} deps.annotation - the useAnnotation() instance
 * @param {object} deps.measurement - the useMeasurement() instance
 * @param {Function} deps.getModelRoot - returns the loaded model's root, or null
 * @param {Function} [deps.notify] - receives { type, title, message } toasts
 * @param {Function} [deps.t] - Nextcloud's translate function
 * @return {object} the shared-notes controller
 */
export function useSharedNotes({ annotation, measurement, getModelRoot, notify = () => {}, t = fallbackT }) {
	const status = ref('idle')
	const canEdit = ref(false)
	let api = null
	const textTimers = new Map()

	const tools = { annotation, measurement }

	const payloadFor = (kind, item) => {
		const root = getModelRoot()
		const toModel = (p) => (root ? sceneToModel(p, root) : toPlain(p))
		if (kind === 'annotation') {
			return { space: 'model', point: toModel(item.point), text: item.text }
		}
		return { space: 'model', points: [toModel(item.point1), toModel(item.point2)] }
	}

	const setStatusAfterSave = () => {
		status.value = 'saved'
	}

	const failed = (item, title) => {
		item.meta.saveState = 'failed'
		status.value = 'error'
		notify({
			type: 'error',
			title,
			message: t('threedviewer', 'Use Retry in the panel to try again.'),
		})
	}

	const create = async (kind, item) => {
		item.meta.saveState = 'saving'
		status.value = 'saving'
		const sent = kind === 'annotation' ? item.text : null
		try {
			const note = await api.create(kind, payloadFor(kind, item))
			item.meta.noteId = note.id
			item.meta.author = note.author ?? null
			item.meta.saveState = 'saved'
			setStatusAfterSave()
			if (item.meta.deleted) {
				await remove(item)
				return
			}
			if (kind === 'annotation' && item.text !== sent) {
				scheduleText(item)
			}
		} catch (error) {
			logger.warn('useSharedNotes', 'Note save failed', { kind, error: error?.message })
			if (item.meta.deleted) {
				return
			}
			failed(item, t('threedviewer', 'Note not saved'))
		}
	}

	const saveText = async (item) => {
		textTimers.delete(item.id)
		if (item.meta.deleted || item.meta.noteId === null) {
			return
		}
		status.value = 'saving'
		try {
			await api.update(item.meta.noteId, payloadFor('annotation', item))
			item.meta.saveState = 'saved'
			setStatusAfterSave()
		} catch (error) {
			logger.warn('useSharedNotes', 'Note update failed', { error: error?.message })
			failed(item, t('threedviewer', 'Change not saved'))
		}
	}

	const scheduleText = (item) => {
		clearTimeout(textTimers.get(item.id)?.timer)
		const timer = setTimeout(() => { saveText(item) }, TEXT_SAVE_DEBOUNCE_MS)
		textTimers.set(item.id, { timer, item })
	}

	const remove = async (item) => {
		try {
			await api.remove(item.meta.noteId)
		} catch (error) {
			logger.warn('useSharedNotes', 'Note delete failed', { error: error?.message })
			notify({
				type: 'error',
				title: t('threedviewer', 'Note not deleted'),
				message: t('threedviewer', 'It will reappear when the model is opened again.'),
			})
		}
	}

	const hooksFor = (kind) => ({
		added(item) {
			if (!canEdit.value) {
				item.meta.saveState = 'local'
				return
			}
			create(kind, item)
		},
		changed(item) {
			if (!canEdit.value || ['local', 'private'].includes(item.meta.saveState)) {
				return
			}
			// Still being created: create() sends the latest text once the id arrives.
			if (item.meta.noteId === null) {
				return
			}
			scheduleText(item)
		},
		deleted(item) {
			item.meta.deleted = true
			clearTimeout(textTimers.get(item.id)?.timer)
			textTimers.delete(item.id)
			if (!canEdit.value || item.meta.noteId === null) {
				// A note still saving is removed by create() once its id comes back.
				return
			}
			remove(item)
		},
	})

	annotation.setNoteHooks(hooksFor('annotation'))
	measurement.setNoteHooks(hooksFor('measurement'))

	const place = (note, root, saveState) => {
		const meta = { noteId: typeof note.id === 'number' ? note.id : null, author: note.author ?? null, saveState }
		const { payload } = note
		if (note.type === 'annotation') {
			const item = annotation.addAnnotationFromNote(pointToScene(payload.point, payload.space, root), payload.text, meta)
			if (payload.space === 'scene' && saveState === 'saved' && root) {
				// A migrated pre-3.6 annotation: save it back in model space, once.
				api.update(meta.noteId, payloadFor('annotation', item)).catch((error) => {
					logger.warn('useSharedNotes', 'Legacy note conversion failed; retried on next open', { error: error?.message })
				})
			}
		} else if (note.type === 'measurement') {
			measurement.addMeasurementFromNote(
				pointToScene(payload.points[0], payload.space, root),
				pointToScene(payload.points[1], payload.space, root),
				meta,
			)
		}
	}

	/**
	 * Replace whatever is drawn with the notes of the model now loaded.
	 *
	 * @param {object} notesApi - from createNotesApi()
	 */
	const load = async (notesApi) => {
		for (const { timer } of textTimers.values()) clearTimeout(timer)
		textTimers.clear()
		// Silent: these belong to the previous model and must not be deleted on the server.
		annotation.clearAllAnnotations({ silent: true })
		measurement.clearAllMeasurements({ silent: true })

		api = notesApi
		canEdit.value = false
		annotation.setCanAdd(false)
		status.value = 'loading'

		let data
		try {
			data = await api.list()
		} catch (error) {
			logger.warn('useSharedNotes', 'Loading notes failed', { error: error?.message })
			status.value = 'error'
			return
		}

		canEdit.value = data.canEdit
		annotation.setCanAdd(data.canEdit)
		const root = getModelRoot()
		for (const note of data.notes) place(note, root, data.canEdit ? 'saved' : 'shared')
		for (const note of data.private) place(note, root, 'private')
		status.value = data.canEdit ? 'saved' : 'readonly'
	}

	const retry = async (kind, item) => {
		if (item.meta.noteId === null) {
			await create(kind, item)
		} else {
			await saveText(item)
		}
	}

	const discard = (kind, item) => {
		const tool = tools[kind]
		if (kind === 'annotation') {
			tool.deleteAnnotation(item.id, { silent: true })
		} else {
			tool.deleteMeasurement(item.id, { silent: true })
		}
	}

	/** Save pending text edits now rather than after the debounce. */
	const flush = async () => {
		const pending = [...textTimers.values()]
		for (const { timer } of pending) clearTimeout(timer)
		await Promise.all(pending.map(({ item }) => saveText(item)))
	}

	return {
		status: readonly(status),
		canEdit: readonly(canEdit),
		load,
		retry,
		discard,
		flush,
	}
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/composables/useSharedNotes.test.js`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/composables/useSharedNotes.js tests/unit/composables/useSharedNotes.test.js
git commit -m "feat(notes): sync annotations and measurements note by note"
```

---

### Task 11: Hooks in `useAnnotation` and `useMeasurement`

**Files:**
- Modify: `src/composables/useAnnotation.js`
- Modify: `src/composables/useMeasurement.js`
- Test: `tests/unit/composables/noteHooks.test.js`

**Interfaces:**
- Produces in `useAnnotation`:
  - `setNoteHooks(hooks)`, `setCanAdd(bool)`, `canAdd: Readonly<Ref<boolean>>`
  - `addAnnotationPoint(point, { silent = false, text, meta } = {}): item`
  - `addAnnotationFromNote(point, text, meta): item`
  - `updateAnnotationText(id, text, { silent = false } = {})`
  - `deleteAnnotation(id, { silent = false } = {})`
  - `clearAllAnnotations({ silent = false } = {})`
  - Every annotation carries `meta`.
- Removed from `useAnnotation`: `loadFromBackend`, `saveToBackend`, `persistenceStatus`, `persistenceError`, the `generateUrl` import, `getRequestToken`.
- Produces in `useMeasurement`:
  - `setNoteHooks(hooks)`
  - `createMeasurement({ silent = false, meta = null } = {})`
  - `addMeasurementFromNote(p1, p2, meta): item`
  - `deleteMeasurement(id, { silent = false } = {})`
  - `clearAllMeasurements({ silent = false } = {})`
  - Every measurement carries `meta`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/composables/noteHooks.test.js`:

```js
const THREE = require('three')
const { useAnnotation } = require('../../../src/composables/useAnnotation.js')
const { useMeasurement } = require('../../../src/composables/useMeasurement.js')

// jsdom has no 2D canvas; the label code needs the calls below (see measurementMarkers.test.js).
beforeAll(() => {
	window.HTMLCanvasElement.prototype.getContext = function getContext() {
		return {
			canvas: this,
			measureText: (text) => ({ width: String(text).length * 20 }),
			fillRect: () => {}, clearRect: () => {}, fillText: () => {}, beginPath: () => {}, rect: () => {}, fill: () => {},
			set fillStyle(v) {}, set font(v) {}, set textAlign(v) {}, set textBaseline(v) {},
		}
	}
})

function sceneWithModel() {
	const scene = new THREE.Scene()
	scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()))
	return scene
}

function spyHooks() {
	return { added: jest.fn(), changed: jest.fn(), deleted: jest.fn() }
}

describe('useAnnotation note hooks', () => {
	test('user actions fire hooks with the reactive item and its meta', () => {
		const a = useAnnotation()
		a.init(sceneWithModel())
		const hooks = spyHooks()
		a.setNoteHooks(hooks)

		const item = a.addAnnotationPoint(new THREE.Vector3(0, 0.5, 0))
		a.updateAnnotationText(item.id, 'Edited')
		a.deleteAnnotation(item.id)

		expect(hooks.added).toHaveBeenCalledWith(expect.objectContaining({ id: item.id, meta: expect.objectContaining({ saveState: 'new' }) }))
		expect(hooks.changed).toHaveBeenCalledWith(expect.objectContaining({ text: 'Edited' }))
		expect(hooks.deleted).toHaveBeenCalledTimes(1)
	})

	test('notes from the server and silent calls fire no hooks', () => {
		const a = useAnnotation()
		a.init(sceneWithModel())
		const hooks = spyHooks()
		a.setNoteHooks(hooks)

		const item = a.addAnnotationFromNote(new THREE.Vector3(), 'Shared', { noteId: 3, author: null, saveState: 'saved' })
		a.updateAnnotationText(item.id, 'x', { silent: true })
		a.clearAllAnnotations({ silent: true })

		expect(item.text).toBe('x')
		expect(hooks.added).not.toHaveBeenCalled()
		expect(hooks.changed).not.toHaveBeenCalled()
		expect(hooks.deleted).not.toHaveBeenCalled()
	})

	test('clear all reports each note as deleted', () => {
		const a = useAnnotation()
		a.init(sceneWithModel())
		const hooks = spyHooks()
		a.setNoteHooks(hooks)
		a.addAnnotationFromNote(new THREE.Vector3(), 'One', { noteId: 1, author: null, saveState: 'saved' })
		a.addAnnotationFromNote(new THREE.Vector3(), 'Two', { noteId: 2, author: null, saveState: 'saved' })

		a.clearAllAnnotations()

		expect(hooks.deleted).toHaveBeenCalledTimes(2)
		expect(a.annotations.value).toHaveLength(0)
	})

	test('a click adds nothing while adding is switched off', () => {
		const a = useAnnotation()
		a.init(sceneWithModel())
		a.setCanAdd(false)
		a.toggleAnnotation()

		a.handleClick({ clientX: 0, clientY: 0, target: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } }, new THREE.PerspectiveCamera())

		expect(a.annotations.value).toHaveLength(0)
	})

	test('import adds each annotation once, with its text, as a user add', () => {
		const a = useAnnotation()
		a.init(sceneWithModel())
		const hooks = spyHooks()
		a.setNoteHooks(hooks)

		a.importFromJSON({ format: 'threedviewer-annotations', annotations: [{ point: { x: 0, y: 0, z: 0 }, text: 'Imported' }] })

		expect(hooks.added).toHaveBeenCalledTimes(1)
		expect(hooks.added).toHaveBeenCalledWith(expect.objectContaining({ text: 'Imported' }))
		expect(hooks.changed).not.toHaveBeenCalled()
	})
})

describe('useMeasurement note hooks', () => {
	test('a completed measurement fires added; one from a note does not', () => {
		const m = useMeasurement()
		m.init(sceneWithModel())
		const hooks = spyHooks()
		m.setNoteHooks(hooks)

		m.addMeasurementPoint(new THREE.Vector3(0, 0, 0))
		m.addMeasurementPoint(new THREE.Vector3(1, 0, 0))
		const fromNote = m.addMeasurementFromNote(new THREE.Vector3(), new THREE.Vector3(0, 2, 0), { noteId: 9, author: null, saveState: 'saved' })

		expect(hooks.added).toHaveBeenCalledTimes(1)
		expect(fromNote.meta.noteId).toBe(9)
		expect(fromNote.distance).toBeCloseTo(2)
		expect(m.measurements.value).toHaveLength(2)
	})

	test('delete and clear fire deleted unless silent', () => {
		const m = useMeasurement()
		m.init(sceneWithModel())
		const hooks = spyHooks()
		m.setNoteHooks(hooks)
		const one = m.addMeasurementFromNote(new THREE.Vector3(), new THREE.Vector3(1, 0, 0), { noteId: 1, author: null, saveState: 'saved' })
		m.addMeasurementFromNote(new THREE.Vector3(), new THREE.Vector3(2, 0, 0), { noteId: 2, author: null, saveState: 'saved' })

		m.deleteMeasurement(one.id)
		m.clearAllMeasurements({ silent: true })

		expect(hooks.deleted).toHaveBeenCalledTimes(1)
		expect(m.measurements.value).toHaveLength(0)
	})

	/** Two notes loaded in the same millisecond must not share an id. */
	test('ids stay unique when measurements are created back to back', () => {
		const m = useMeasurement()
		m.init(sceneWithModel())
		const a = m.addMeasurementFromNote(new THREE.Vector3(), new THREE.Vector3(1, 0, 0), { noteId: 1, author: null, saveState: 'saved' })
		const b = m.addMeasurementFromNote(new THREE.Vector3(), new THREE.Vector3(1, 0, 0), { noteId: 2, author: null, saveState: 'saved' })

		expect(a.id).not.toBe(b.id)
	})
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/unit/composables/noteHooks.test.js`
Expected: FAIL with `a.setNoteHooks is not a function`.

- [ ] **Step 3: Change `useAnnotation.js`**

1. Remove `import { generateUrl } from '@nextcloud/router'`.
2. Replace the persistence-state block (the `persistenceStatus` / `persistenceError` / `persistenceSuppressed` refs and their comment) with:

```js
	// Whether a click may add an annotation. Off while a model's notes are loading and
	// for users who can only view the model — useSharedNotes switches it.
	const canAdd = ref(true)

	// Change hooks, set by useSharedNotes. Notes that come from the server, and anything
	// passed `{ silent: true }`, fire none, so loading notes never saves them back.
	let noteHooks = {}
	const setNoteHooks = (hooks) => { noteHooks = hooks || {} }
	const setCanAdd = (value) => { canAdd.value = value }

	// Date.now() alone collides when notes are drawn in the same millisecond on load.
	let idSequence = 0
	const nextId = () => `${Date.now()}-${++idSequence}`
```

3. In `handleClick`, change `if (!isActive.value) {` to `if (!isActive.value || !canAdd.value) {`.
4. Replace `addAnnotationPoint` with:

```js
	// Add annotation point
	const addAnnotationPoint = (point, { silent = false, text, meta } = {}) => {
		try {
			annotations.value.push({
				id: nextId(),
				point: point.clone(),
				text: typeof text === 'string' ? text : `Annotation ${annotations.value.length + 1}`,
				timestamp: new Date().toISOString(),
				meta: meta ?? { noteId: null, author: null, saveState: 'new' },
				pointMesh: null,
				textMesh: null,
			})
			// The reactive entry, not the object pushed: useSharedNotes writes meta on it
			// and the panel has to see those writes.
			const annotation = annotations.value[annotations.value.length - 1]
			currentAnnotation.value = annotation

			annotation.pointMesh = createAnnotationPoint(annotation)
			annotation.textMesh = createAnnotationText(annotation)

			if (!silent) {
				noteHooks.added?.(annotation)
			}
			return annotation
		} catch (error) {
			logError('useAnnotation', 'Failed to add annotation point', error)
			return null
		}
	}

	const addAnnotationFromNote = (point, text, meta) => addAnnotationPoint(point, { silent: true, text, meta })
```

5. `updateAnnotationText`: change the signature to `(annotationId, newText, { silent = false } = {})`, and after the `if (textMesh) { … }` block, still inside `if (annotation)`, add `if (!silent) noteHooks.changed?.(annotation)`.
6. `deleteAnnotation`: change the signature to `(annotationId, { silent = false } = {})`, and immediately after `const annotation = annotations.value[index]` add `if (!silent) noteHooks.deleted?.(annotation)`.
7. `clearAllAnnotations`: change the signature to `({ silent = false } = {})`, and as the first statement inside `try` add:

```js
			if (!silent) {
				for (const annotation of annotations.value) noteHooks.deleted?.(annotation)
			}
```

8. In `importFromJSON`, replace the body of the loop after the point validation with:

```js
			const point = new THREE.Vector3(item.point.x, item.point.y, item.point.z)
			const text = typeof item.text === 'string' && item.text.length > 0 ? item.text : undefined
			const fresh = addAnnotationPoint(point, { text })
			if (fresh && typeof item.timestamp === 'string') {
				fresh.timestamp = item.timestamp
			}
			added++
```

9. Delete `loadFromBackend`, `saveToBackend` and `getRequestToken`, along with their docblocks.
10. In the returned object, remove `persistenceStatus`, `persistenceError`, `loadFromBackend` and `saveToBackend`. Add `canAdd: readonly(canAdd)`, `setCanAdd`, `setNoteHooks` and `addAnnotationFromNote`.

- [ ] **Step 4: Change `useMeasurement.js`**

1. After the `textMeshes` ref (around line 45), add:

```js
	let noteHooks = {}
	const setNoteHooks = (hooks) => { noteHooks = hooks || {} }

	// Date.now() alone collides when notes are drawn in the same millisecond on load.
	let idSequence = 0
	const nextId = () => `${Date.now()}-${++idSequence}`
```

2. Change `createMeasurement` to accept `({ silent = false, meta = null } = {})`. In the measurement object, use `id: nextId()` and add `meta: meta ?? { noteId: null, author: null, saveState: 'new' },`. Replace

```js
		measurements.value.push(measurement)
		currentMeasurement.value = measurement

		// Create visual line between points
		createMeasurementLine(measurement)

		// Create distance text
		createDistanceText(measurement)

		// Reset for next measurement
		points.value = []
```

with

```js
		measurements.value.push(measurement)
		const entry = measurements.value[measurements.value.length - 1]
		currentMeasurement.value = entry

		createMeasurementLine(entry)
		createDistanceText(entry)

		points.value = []

		if (!silent) {
			noteHooks.added?.(entry)
		}
		return entry
```

3. After `addMeasurementPoint`, add:

```js
	/**
	 * Draw a measurement that came from the server. Fires no hooks, so loading notes never
	 * saves them back.
	 */
	const addMeasurementFromNote = (point1, point2, meta) => {
		points.value = []
		points.value.push(point1.clone())
		createPointIndicator(point1)
		points.value.push(point2.clone())
		createPointIndicator(point2)
		return createMeasurement({ silent: true, meta })
	}
```

4. `deleteMeasurement`: change the signature to `(measurementId, { silent = false } = {})`, and at the top of `if (index !== -1) {` add `if (!silent) noteHooks.deleted?.(measurements.value[index])`.
5. `clearAllMeasurements`: change the signature to `({ silent = false } = {})`, and add as its first statement:

```js
		if (!silent) {
			for (const m of measurements.value) noteHooks.deleted?.(m)
		}
```

6. In the returned object, add `setNoteHooks` and `addMeasurementFromNote`.

- [ ] **Step 5: Run the new tests and the whole Jest suite**

Run: `npx jest tests/unit/composables/noteHooks.test.js && npx jest`
Expected: all pass. Two expected knock-on failures, both in files that match the source by regex:
- `tests/unit/readonlyStateBindings.test.js` or `componentWiring.test.js` may reference `persistenceStatus`.
- `tests/unit/annotationNoteTyping.test.js` may reference the old `updateAnnotationText` call shape.

Update those tests to the new names, keeping what each one asserts. Don't delete them.

- [ ] **Step 6: Commit**

```bash
git add src/composables/useAnnotation.js src/composables/useMeasurement.js tests/unit
git commit -m "refactor(notes): report annotation and measurement changes through hooks"
```

---

### Task 12: ThreeViewer wiring, panel UI, export and import, CHANGELOG, Playwright

**Files:**
- Modify: `src/components/ThreeViewer.vue`
- Modify: `CHANGELOG.md`
- Test: `tests/playwright/shared-notes.spec.ts`

**Interfaces:**
- Consumes: `useSharedNotes` (Task 10), `createNotesApi` (Task 9), `getPublicShareContext` from `src/composables/usePublicShare.js`, and the composable changes from Task 11.

- [ ] **Step 1: Wire the composable**

In `ThreeViewer.vue` `<script>`:
1. Add imports next to the other composables:

```js
import { useSharedNotes } from '../composables/useSharedNotes.js'
import { createNotesApi } from '../utils/notesApi.js'
import { getPublicShareContext } from '../composables/usePublicShare.js'
```

If `usePublicShare.js` is already imported, add `getPublicShareContext` to that import instead.

2. Right after `const annotation = useAnnotation()` (line ~831), and after `measurement` is declared (move the line below `const measurement = useMeasurement()` if needed), add:

```js
		const sharedNotes = useSharedNotes({
			annotation,
			measurement,
			getModelRoot: () => modelRoot.value,
			notify: (toast) => emit('push-toast', toast),
			t,
		})
```

3. Replace the auto-load block at lines ~1543–1550 with:

```js
					// Load the model's shared notes. Skipped for the synthetic 'comparison'
					// fileId: the comparison model shares the scene but isn't annotatable.
					if (fileId && fileId !== 'comparison') {
						const share = getPublicShareContext()
						sharedNotes.load(createNotesApi({ fileId, shareToken: share?.token ?? null })).catch((e) => {
							logger.warn('ThreeViewer', 'Loading notes failed', e)
						})
					}
```

4. Delete the whole debounced auto-save block (`let annotationSaveTimer = null` through the end of its `watch(...)`, lines ~3371–3395).
5. Replace `annotationSyncLabel` and `annotationSyncTooltip` with:

```js
		const annotationSyncLabel = computed(() => {
			switch (sharedNotes.status.value) {
			case 'loading': return t('threedviewer', 'Loading…')
			case 'saving': return t('threedviewer', 'Saving…')
			case 'saved': return t('threedviewer', 'Saved')
			case 'error': return t('threedviewer', 'Save failed')
			case 'readonly': return t('threedviewer', 'View only')
			default: return ''
			}
		})
		const annotationSyncTooltip = computed(() => {
			switch (sharedNotes.status.value) {
			case 'loading': return t('threedviewer', 'Loading notes…')
			case 'saving': return t('threedviewer', 'Saving notes…')
			case 'saved': return t('threedviewer', 'Shared with everyone who can open this model')
			case 'error': return t('threedviewer', 'Some notes could not be saved')
			case 'readonly': return t('threedviewer', 'You can see these notes but not change them')
			default: return ''
			}
		})

		const notesCanEdit = computed(() => sharedNotes.canEdit.value)

		/** Whether this user may change a given note: shared notes need edit rights. */
		const canChangeNote = (item) => notesCanEdit.value || ['local', 'private'].includes(item.meta?.saveState)

		const noteStateLabel = (item) => {
			switch (item.meta?.saveState) {
			case 'saving': return t('threedviewer', 'Saving…')
			case 'failed': return t('threedviewer', 'Not saved')
			case 'local': return t('threedviewer', 'Not saved')
			case 'private': return t('threedviewer', 'Private, not shared')
			default: return ''
			}
		}
```

6. Find where `annotationPersistenceStatus` is defined (`grep -n annotationPersistenceStatus src/components/ThreeViewer.vue`). Replace its definition with `const annotationPersistenceStatus = computed(() => sharedNotes.status.value)`. Add `sharedNotes`, `notesCanEdit`, `canChangeNote` and `noteStateLabel` to the object `setup()` returns.

7. Replace `clearAllAnnotations` (line ~2610) and change the measurement clear-all binding:

```js
		const confirmClearShared = (count) => !notesCanEdit.value || count === 0
			|| window.confirm(t('threedviewer', 'Delete all {count} notes for everyone who can open this model?', { count }))

		const clearAllAnnotations = () => {
			if (confirmClearShared(annotation.annotations.value.length)) {
				annotation.clearAllAnnotations()
			}
		}

		const clearAllMeasurements = () => {
			if (confirmClearShared(measurement.measurements.value.length)) {
				measurement.clearAllMeasurements()
			}
		}
```

Add `clearAllMeasurements` to the returned object. In the template, change `@click="measurement.clearAllMeasurements"` to `@click="clearAllMeasurements"`.

8. Replace `exportAnnotationsJSON`'s `const doc = …` line with:

```js
				const doc = {
					...annotation.exportAsJSON(props.filename || ''),
					version: 2,
					measurements: measurement.measurements.value.map(m => ({
						point1: { x: m.point1.x, y: m.point1.y, z: m.point1.z },
						point2: { x: m.point2.x, y: m.point2.y, z: m.point2.z },
					})),
				}
```

Change the success toast message to `t('threedviewer', '{count} note(s) saved to JSON', { count: doc.annotations.length + doc.measurements.length })`.

9. In `onAnnotationImportFile`, after `const result = annotation.importFromJSON(text)`, add:

```js
				const parsed = JSON.parse(text)
				for (const m of Array.isArray(parsed.measurements) ? parsed.measurements : []) {
					const valid = [m?.point1, m?.point2].every(p => p && [p.x, p.y, p.z].every(Number.isFinite))
					if (!valid) continue
					measurement.addMeasurementPoint(new THREE.Vector3(m.point1.x, m.point1.y, m.point1.z))
					measurement.addMeasurementPoint(new THREE.Vector3(m.point2.x, m.point2.y, m.point2.z))
					result.added++
				}
```

- [ ] **Step 2: Update the panel templates**

In the annotation list (`v-for="(annotation, index) in annotations"`):
- Wrap the delete button in `v-if="canChangeNote(annotation)"`.
- Add `:readonly="!canChangeNote(annotation)"` to `.annotation-text-input`.
- After the `.canvas-panel-card-header` div, add:

```html
						<p v-if="annotation.meta?.author || noteStateLabel(annotation)" class="canvas-panel-hint">
							<span v-if="annotation.meta?.author">{{ annotation.meta.author.displayName }}</span>
							<span v-if="annotation.meta?.author && noteStateLabel(annotation)"> · </span>
							<span v-if="noteStateLabel(annotation)">{{ noteStateLabel(annotation) }}</span>
						</p>
						<div v-if="annotation.meta?.saveState === 'failed'" class="canvas-panel-actions">
							<button type="button" class="tdv-btn" @click="sharedNotes.retry('annotation', annotation)">
								{{ t('threedviewer', 'Retry') }}
							</button>
							<button v-if="annotation.meta.noteId === null"
								type="button"
								class="canvas-panel-danger"
								@click="sharedNotes.discard('annotation', annotation)">
								{{ t('threedviewer', 'Discard') }}
							</button>
						</div>
```

Add the same block in the measurement list with `m` in place of `annotation` and `'measurement'` as the kind. Wrap its delete button in `v-if="canChangeNote(m)"`.

In the annotation overlay, after the import/export/clear actions row, add the view-only hint:

```html
				<p v-if="!notesCanEdit" class="canvas-panel-hint">
					{{ t('threedviewer', 'This model is view-only for you, so you can’t add annotations.') }}
				</p>
```

In the measurement overlay, after the "Click two points…" hint, add:

```html
				<p v-if="!notesCanEdit" class="canvas-panel-hint">
					{{ t('threedviewer', 'Measurements you take here aren’t saved.') }}
				</p>
```

Hide the annotation panel's "Clear all" button and the import button when `!notesCanEdit`: add `v-if="notesCanEdit"` to both. Import stays available for editors only, because an import by a read-only user would only create unsaved notes.

These reuse existing classes (`canvas-panel-hint`, `canvas-panel-actions`, `tdv-btn`, `canvas-panel-danger`), so no new CSS is needed. The design-system tests (`designSystemAdoption`, `chromeLiterals`, `forcedColorsSelectors`) stay green.

- [ ] **Step 3: Run lint, the whole Jest suite and the build**

Run: `npm run lint && npx jest && npm run build`
Expected: 0 lint errors (warnings already exist), all Jest suites pass, and the build succeeds. If `componentWiring.test.js` checks that every template handler exists in `setup()`'s return value, it will flag anything missed in Step 1.6; add it.

- [ ] **Step 4: Write the Playwright test**

`tests/playwright/shared-notes.spec.ts`. It reuses the smoke harness approach (static server plus the built bundle), with the model and notes routes mocked by `page.route`:

```ts
import { test, expect } from '@playwright/test'
import fs from 'fs'
import http from 'http'
import path from 'path'
import { lookup as mimeLookup } from 'mime-types'

const FIXTURE = fs.readFileSync(path.resolve(process.cwd(), 'tests/fixtures/triangle.gltf'), 'utf8')
const FILE_ID = 4242

const HTML = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="requesttoken" content="test-token"></head>
<body><div id="threedviewer" style="height:100vh"></div>
<script>
  window.OCA = { Viewer: { handlers: {}, registerHandler(h) { this.handlers[h.id || 'threedviewer'] = h }, open() {} } };
  window.OC = { webroot: '', appswebroots: {}, filePath: (a, t, p) => '/' + String(p).replace(/^\\//, ''),
    linkTo: (a, f) => '/' + String(f).replace(/^\\//, ''), generateUrl: (u) => String(u), requestToken: 'test-token' };
  window.history.replaceState({}, '', '?fileId=${FILE_ID}&filename=triangle.gltf');
</script>
<script type="module" src="/js/threedviewer-main.mjs"></script></body></html>`

let server: http.Server
let baseURL: string

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0]
    if (urlPath === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(HTML)
      return
    }
    const filePath = path.join(process.cwd(), urlPath.replace(/^\//, ''))
    if (filePath.startsWith(process.cwd()) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, { 'Content-Type': String(mimeLookup(path.extname(filePath)) || 'application/octet-stream') })
      fs.createReadStream(filePath).pipe(res)
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  const addr = server.address()
  baseURL = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
})

test.afterAll(() => server?.close())

async function mockBackend(page, notesBody: object) {
  const seen = { notesGets: 0, writes: 0 }
  await page.route(`**/apps/threedviewer/api/file/${FILE_ID}**`, route => route.fulfill({
    status: 200,
    body: FIXTURE,
    headers: { 'Content-Type': 'model/gltf+json', 'Content-Disposition': 'inline; filename="triangle.gltf"' },
  }))
  await page.route(`**/apps/threedviewer/api/notes/${FILE_ID}**`, route => {
    if (route.request().method() === 'GET') {
      seen.notesGets++
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(notesBody) })
    }
    seen.writes++
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 999, author: null }) })
  })
  return seen
}

async function openAnnotationPanel(page) {
  await page.waitForFunction(() => (window as any).__LOAD_COMPLETE === true, null, { timeout: 20000 })
  await page.getByRole('button', { name: /tools/i }).first().click()
  await page.getByRole('button', { name: /^Annotation/ }).first().click()
  await expect(page.locator('.annotation-overlay')).toBeVisible()
}

test('shared notes appear on load, with their author', async ({ page }) => {
  const seen = await mockBackend(page, {
    canEdit: true,
    notes: [{ id: 1, type: 'annotation', payload: { space: 'model', point: { x: 0, y: 0, z: 0 }, text: 'Check this hole' }, author: { uid: 'bob', displayName: 'Bob' }, createdAt: 1, updatedAt: 1 }],
    private: [],
  })
  await page.goto(baseURL + '/')
  await openAnnotationPanel(page)

  await expect(page.locator('.annotation-text-input').first()).toHaveValue('Check this hole')
  await expect(page.locator('.annotation-overlay')).toContainText('Bob')
  expect(seen.notesGets).toBe(1)
  expect(seen.writes).toBe(0)
})

test('view-only: adding is disabled and notes are read-only', async ({ page }) => {
  await mockBackend(page, {
    canEdit: false,
    notes: [{ id: 1, type: 'annotation', payload: { space: 'model', point: { x: 0, y: 0, z: 0 }, text: 'Shared' }, author: null, createdAt: 1, updatedAt: 1 }],
    private: [],
  })
  await page.goto(baseURL + '/')
  await openAnnotationPanel(page)

  await expect(page.locator('.annotation-overlay')).toContainText('view-only')
  await expect(page.locator('.annotation-text-input').first()).toHaveAttribute('readonly', '')
  await expect(page.locator('.annotation-overlay .canvas-panel-delete')).toHaveCount(0)
})
```

- [ ] **Step 5: Run the Playwright test**

Run: `npm run build && npx playwright test tests/playwright/shared-notes.spec.ts`
Expected: 2 passed.
- If the model never loads (`__LOAD_COMPLETE` stays false), open the trace (`npx playwright test --trace on`) and check which URL the app requests for the model. Point the first `page.route` at that URL.
- If the button names differ, use the accessible names shown in the trace.

Don't change what the tests assert.

- [ ] **Step 6: Add the CHANGELOG entry**

Under `## [Unreleased]` in `CHANGELOG.md`, add an `### Added` section (above the existing `### Changed`) and a `### Removed` section:

```markdown
### Added
- **Annotations and measurements are shared with everyone who can open the model.** They were saved privately per user, and measurements were not saved at all. Now each model has one set of notes: share recipients and public-link visitors see it, and anyone who can edit the model can add, change or delete notes. Each note saves on its own, so two people editing at once never overwrite each other. Each note shows its author, except on public links. Existing private annotations move into the shared set the first time their author opens the model, if that user can edit it; otherwise they stay visible to that user only, marked "Private, not shared".
- JSON export includes measurements, and import restores them.

### Removed
- The `/api/annotations/{fileId}` endpoints, replaced by `/api/notes/{fileId}`.
```

- [ ] **Step 7: Run everything once more**

Run: `composer test:unit && composer cs:check && composer psalm && npm run lint && npx jest && npm run build && npx playwright test`
Expected: all green, apart from the flaky `no top bar control is covered by a floating panel` Playwright test noted in #180. If it fails, re-run it on its own before investigating.

- [ ] **Step 8: Commit**

```bash
git add src/components/ThreeViewer.vue CHANGELOG.md tests/playwright/shared-notes.spec.ts
git commit -m "feat(notes): share annotations and measurements in the viewer"
```

---

## Self-Review Notes

- **Spec coverage:**

  | Spec section | Task |
  |---|---|
  | Storage | 1 |
  | Payload and validation | 2 |
  | Access, signed-in | 3 and 5 |
  | Access, public | 6 |
  | CSRF | 5 (unit, reflection) and 7 (HTTP) |
  | API | 5 and 6 |
  | Legacy migration | 4, 7 and 10 (scene conversion) |
  | Viewer behaviour | 10, 11 and 12 |
  | Cleanup | 8 |
  | PHP unit tests | 2–6 |
  | PHP integration tests | 1, 7 and 8 |
  | Jest | 9–11 |
  | Playwright | 12 |
  | Rollout (CHANGELOG) | 12 |

  The app version bump that triggers the migration happens at release, and isn't part of this plan.
- **Spec refinements recorded here:** the Retry and Discard buttons live in the panel, and the byte cap is 10 KB. Both are already in the spec.
- **Type consistency:**
  - `meta.saveState` values are the same across Tasks 10, 11 and 12.
  - `setNoteHooks`, `addAnnotationFromNote`, `addMeasurementFromNote`, `setCanAdd` and `{ silent }` match between the Task 10 fakes and the Task 11 implementation.
  - `NoteAccessResult::$canEdit` is used in Tasks 3 and 5.
  - `serialize(Note, bool)` is used in Tasks 4, 5 and 6.
