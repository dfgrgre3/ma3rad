# Windows 32-bit memory limits

The Windows IA-32 build calculates its maximum SQLite database size from
installed physical memory:

```text
database limit = clamp(total RAM / 32, 32 MiB, 128 MiB)
```

For example, a 2 GiB computer gets a 64 MiB limit. The limit applies to
database loading, saving, and backup restoration. The x64 build retains its
existing 500 MiB limit.

The application uses SQL.js, which keeps the complete database in memory and
creates temporary copies while loading, saving, and exporting. This limit
reduces the risk of exhausting the 32-bit address space, but does not guarantee
that every database below the limit will fit when Windows or other programs
are already using memory. Windows 32-bit builds are therefore not suitable for
unbounded databases or every possible hardware configuration. The practical
minimum target is Windows 7 with 2 GiB of RAM; less memory may still prevent
startup or normal operation.

The IA-32 build also caps each V8 heap at 256 MiB (the x64 setting remains
512 MiB) and uses a smaller short-lived query cache with a 4 MiB
estimated-payload budget (compared with 16 MiB in x64) to leave more memory
available to the database and other application features. This may cause some
screens to repeat queries; it does not disable features or alter saved data.

Run `npm run test:ia32` to verify the memory limits. Create the IA-32 installer
on Windows with `npm run electron:dist:ia32`.

If an existing database exceeds the device's limit, keep the original file and
use a machine with more available memory or the x64 build to export/archive it.
Do not delete or replace the database to work around the size error.
