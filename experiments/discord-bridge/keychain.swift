// macOS Security.framework, no third-party secret transport or command-line secrets.
// Compile once locally. Do not run store/read until the owner approves this mechanism.
import Foundation
import Security
import Darwin

let service = "org.plates.discord-test-bridge"
let account = "bot-1565878548068311060"
func stop(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8)); exit(1)
}
let args = CommandLine.arguments
guard args.count == 2, ["store", "read", "describe"].contains(args[1]) else { stop("Use store, read, or describe; never pass a token as an argument.") }
if args[1] == "describe" {
    print("macOS login Keychain; service=\(service); account=\(account); store refuses replacement; read requires a pipe.")
    exit(0)
}
guard ProcessInfo.processInfo.environment["PLATES_DISCORD_SECRET_APPROVED"] == "yes" else { stop("Specific action-time approval required before Keychain access.") }
let keychainPath = NSHomeDirectory() + "/Library/Keychains/login.keychain-db"
var keychain: SecKeychain?
guard SecKeychainOpen(keychainPath, &keychain) == errSecSuccess, let keychain else { stop("Login Keychain unavailable; no fallback store.") }
let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: service, kSecAttrAccount as String: account,
    kSecMatchSearchList as String: [keychain]]
if args[1] == "store" {
    guard isatty(STDIN_FILENO) == 1, isatty(STDERR_FILENO) == 1 else { stop("Run store manually in a local Terminal with a TTY.") }
    guard let first = getpass("Discord bot token (hidden; paste locally): ") else { stop("Token entry cancelled.") }
    let token = String(cString: first)
    first.initialize(repeating: 0, count: strlen(first))
    guard token.count >= 30, token.count <= 512,
        token.range(of: "^[A-Za-z0-9_.-]+$", options: .regularExpression) != nil else { stop("Token format is invalid; nothing stored.") }
    var trusted: SecTrustedApplication?
    guard SecTrustedApplicationCreateFromPath(nil, &trusted) == errSecSuccess, let trusted else { stop("Cannot establish helper identity.") }
    var access: SecAccess?
    guard SecAccessCreate("Plates Discord test bot" as CFString, [trusted] as CFArray, &access) == errSecSuccess, let access else { stop("Cannot establish Keychain access control.") }
    var item = query
    item.removeValue(forKey: kSecMatchSearchList as String)
    item[kSecUseKeychain as String] = keychain
    item[kSecAttrAccess as String] = access
    item[kSecAttrLabel as String] = "Plates TEST bot — Discord #test only"
    item[kSecValueData as String] = Data(token.utf8)
    let status = SecItemAdd(item as CFDictionary, nil)
    guard status == errSecSuccess else { stop(status == errSecDuplicateItem ? "Item already exists; refused to replace it." : "Keychain store failed; token not printed.") }
    print("Token stored in the local login Keychain. No Discord request was sent.")
} else {
    guard isatty(STDOUT_FILENO) == 0 else { stop("Refusing to display a token in a terminal; use the bridge runtime.") }
    var request = query
    request[kSecReturnData as String] = true
    request[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess, let bytes = result as? Data else { stop("Keychain read unavailable; no fallback.") }
    FileHandle.standardOutput.write(bytes)
}
