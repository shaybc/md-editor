using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

namespace MdEditor.WindowsCredentialHelper;

/// <summary>Owns MD-Editor's isolated Windows Generic Credential namespace.</summary>
internal sealed class WindowsCredentialStore
{
    private const string TargetPrefix = "MD-Editor/AI-Companion/";
    private const uint CredentialTypeGeneric = 1;
    private const uint CredentialPersistLocalMachine = 2;
    private const int ErrorNotFound = 1168;
    private const int MaximumSecretBytes = 2560;

    /// <summary>Store or replace an API credential for the supplied opaque identifier.</summary>
    public string Write(string credentialId, string secret)
    {
        string normalizedId = NormalizeCredentialId(credentialId, allowEmpty: true);
        if (normalizedId.Length == 0) normalizedId = Guid.NewGuid().ToString("D");

        byte[] secretBytes = Encoding.UTF8.GetBytes(secret ?? string.Empty);
        if (secretBytes.Length == 0 || secretBytes.Length > MaximumSecretBytes)
        {
            CryptographicOperations.ZeroMemory(secretBytes);
            throw new CredentialStoreException("INVALID_SECRET_SIZE");
        }

        IntPtr secretPointer = Marshal.AllocHGlobal(secretBytes.Length);
        try
        {
            Marshal.Copy(secretBytes, 0, secretPointer, secretBytes.Length);
            var credential = new NativeCredential
            {
                Type = CredentialTypeGeneric,
                TargetName = TargetName(normalizedId),
                CredentialBlobSize = (uint)secretBytes.Length,
                CredentialBlob = secretPointer,
                Persist = CredentialPersistLocalMachine,
                UserName = "MD-Editor"
            };
            if (!CredWrite(ref credential, 0)) throw new CredentialStoreException("CREDENTIAL_WRITE_FAILED");
            return normalizedId;
        }
        finally
        {
            CryptographicOperations.ZeroMemory(secretBytes);
            ZeroAndFree(secretPointer, secretBytes.Length);
        }
    }

    /// <summary>Read an API credential for use inside the backend bridge.</summary>
    public string Read(string credentialId)
    {
        string normalizedId = NormalizeCredentialId(credentialId);
        if (!CredRead(TargetName(normalizedId), CredentialTypeGeneric, 0, out IntPtr credentialPointer))
        {
            throw new CredentialStoreException(Marshal.GetLastWin32Error() == ErrorNotFound ? "CREDENTIAL_NOT_FOUND" : "CREDENTIAL_READ_FAILED");
        }

        try
        {
            NativeCredential credential = Marshal.PtrToStructure<NativeCredential>(credentialPointer);
            int byteCount = checked((int)credential.CredentialBlobSize);
            if (byteCount <= 0 || byteCount > MaximumSecretBytes) throw new CredentialStoreException("INVALID_STORED_SECRET");
            byte[] secretBytes = new byte[byteCount];
            try
            {
                Marshal.Copy(credential.CredentialBlob, secretBytes, 0, byteCount);
                return Encoding.UTF8.GetString(secretBytes);
            }
            finally
            {
                CryptographicOperations.ZeroMemory(secretBytes);
            }
        }
        finally
        {
            CredFree(credentialPointer);
        }
    }

    /// <summary>Report whether a credential exists without disclosing its value.</summary>
    public bool Exists(string credentialId)
    {
        string normalizedId = NormalizeCredentialId(credentialId);
        if (CredRead(TargetName(normalizedId), CredentialTypeGeneric, 0, out IntPtr credentialPointer))
        {
            CredFree(credentialPointer);
            return true;
        }
        int error = Marshal.GetLastWin32Error();
        if (error == ErrorNotFound) return false;
        throw new CredentialStoreException("CREDENTIAL_STATUS_FAILED");
    }

    /// <summary>Delete a credential; an already absent entry is considered deleted.</summary>
    public bool Delete(string credentialId)
    {
        string normalizedId = NormalizeCredentialId(credentialId);
        if (CredDelete(TargetName(normalizedId), CredentialTypeGeneric, 0)) return true;
        int error = Marshal.GetLastWin32Error();
        if (error == ErrorNotFound) return true;
        throw new CredentialStoreException("CREDENTIAL_DELETE_FAILED");
    }

    private static string NormalizeCredentialId(string value, bool allowEmpty = false)
    {
        string candidate = (value ?? string.Empty).Trim();
        if (allowEmpty && candidate.Length == 0) return string.Empty;
        if (!Guid.TryParseExact(candidate, "D", out Guid parsed)) throw new CredentialStoreException("INVALID_CREDENTIAL_ID");
        return parsed.ToString("D");
    }

    private static string TargetName(string credentialId) => TargetPrefix + credentialId;

    private static void ZeroAndFree(IntPtr pointer, int length)
    {
        if (pointer == IntPtr.Zero) return;
        for (int index = 0; index < length; index++) Marshal.WriteByte(pointer, index, 0);
        Marshal.FreeHGlobal(pointer);
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct NativeCredential
    {
        public uint Flags;
        public uint Type;
        [MarshalAs(UnmanagedType.LPWStr)] public string? TargetName;
        [MarshalAs(UnmanagedType.LPWStr)] public string? Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        [MarshalAs(UnmanagedType.LPWStr)] public string? TargetAlias;
        [MarshalAs(UnmanagedType.LPWStr)] public string? UserName;
    }

    [DllImport("Advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredWrite([In] ref NativeCredential credential, uint flags);

    [DllImport("Advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);

    [DllImport("Advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredDelete(string target, uint type, uint flags);

    [DllImport("Advapi32.dll")]
    private static extern void CredFree([In] IntPtr buffer);
}
