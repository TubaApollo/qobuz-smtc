{
  "targets": [{
    "target_name": "smtc_native",
    "sources": ["src/smtc_addon.cpp"],
    "include_dirs": [
      "<!@(node -p \"require('node-addon-api').include\")"
    ],
    "defines": [
      "NAPI_VERSION=8",
      "_WIN32_WINNT=0x0A00",
      "UNICODE",
      "_UNICODE"
    ],
    "msvs_settings": {
      "VCCLCompilerTool": {
        "AdditionalOptions": ["/std:c++17", "/EHsc"],
        "RuntimeLibrary": 2
      },
      "VCLinkerTool": {
        "AdditionalOptions": ["/PDBALTPATH:%_PDB%"]
      }
    },
    "libraries": [
      "runtimeobject.lib"
    ]
  }]
}
