param([string]$SrcDir, [string]$OutDir, [double]$Grow = 1.10, [int[]]$Names = (1..7), [switch]$AnchorTop)
# -AnchorTop: כל הרקע הנוסף למטה (התמונה צמודה לקצה העליון) – כשמשהו בתמונה חייב להגיע עד למעלה (עשן, §536יב).
# -Grow 1.0 = בלי שוליים בצדדים. -Names = אילו splash-N.jpg לעבד.
# §536יא — מרחיב את רקע תמונות הפתיחה כדי שהדמות תיראה קטנה יותר על כל המסך (cover), בלי מסגרת:
# הקנבס החדש ביחס 9:19.5 (טלפון), רחב פי $Grow מהמקור; השוליים מתמלאים בהמשך של צבעי הקצה של התמונה
# עצמה (ממוצע פס הקצה, מוחלק לאורך), שנמוג לאט לצבע הממוצע של כל הקצוות; ומעבר רך (feather) בתפר.
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class Pad {
  static double[][] Smooth(double[][] a, int r) {
    int n = a.Length; var o = new double[n][];
    for (int i = 0; i < n; i++) { double s0=0,s1=0,s2=0; int c=0;
      for (int k = Math.Max(0,i-r); k <= Math.Min(n-1,i+r); k++) { s0+=a[k][0]; s1+=a[k][1]; s2+=a[k][2]; c++; }
      o[i] = new double[]{s0/c,s1/c,s2/c}; }
    return o;
  }
  public static Bitmap Run(Bitmap src, double grow, bool anchorTop) {
    int sw = src.Width, sh = src.Height;
    int W = (int)Math.Round(sw * grow); int H = (int)Math.Round(W * 19.5 / 9.0);
    if (H < sh + 20) H = sh + 20;
    int ox = (W - sw) / 2, oy = anchorTop ? 0 : (H - sh) / 2;
    bool pT = oy > 0, pB = H - oy - sh > 0, pL = ox > 0, pR = W - ox - sw > 0;
    Func<int,int,double> padDist = (qx,qy) => { double m = 1e9; if (pT) m = Math.Min(m, qy); if (pB) m = Math.Min(m, sh-1-qy); if (pL) m = Math.Min(m, qx); if (pR) m = Math.Min(m, sw-1-qx); return m; };
    var s = new byte[sw*sh*4];
    var sd = src.LockBits(new Rectangle(0,0,sw,sh), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    Marshal.Copy(sd.Scan0, s, 0, s.Length); src.UnlockBits(sd);
    Func<int,int,int,double> px = (x,y,ch) => s[(y*sw+x)*4+ch];
    int band = 14, R = 45;
    var top = new double[sw][]; var bot = new double[sw][];
    for (int x = 0; x < sw; x++) { var t = new double[3]; var b = new double[3];
      for (int y = 0; y < band; y++) for (int ch = 0; ch < 3; ch++) { t[ch]+=px(x,y,ch); b[ch]+=px(x,sh-1-y,ch); }
      for (int ch = 0; ch < 3; ch++) { t[ch]/=band; b[ch]/=band; } top[x]=t; bot[x]=b; }
    var lef = new double[sh][]; var rig = new double[sh][];
    for (int y = 0; y < sh; y++) { var l = new double[3]; var r = new double[3];
      for (int x = 0; x < band; x++) for (int ch = 0; ch < 3; ch++) { l[ch]+=px(x,y,ch); r[ch]+=px(sw-1-x,y,ch); }
      for (int ch = 0; ch < 3; ch++) { l[ch]/=band; r[ch]/=band; } lef[y]=l; rig[y]=r; }
    top = Smooth(top,R); bot = Smooth(bot,R); lef = Smooth(lef,R); rig = Smooth(rig,R);
    
    Func<double[][],double[]> avg = a => { var m = new double[3]; foreach (var v in a) for (int ch=0;ch<3;ch++) m[ch]+=v[ch]; for (int ch=0;ch<3;ch++) m[ch]/=a.Length; return m; };
    var aT = avg(top); var aB = avg(bot); var aL = avg(lef); var aR = avg(rig);
    var o = new byte[W*H*4];
    int feather = 14;
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
      int sx = x - ox, sy = y - oy; int i = (y*W+x)*4;
      int cx = Math.Max(0, Math.Min(sw-1, sx)), cy = Math.Max(0, Math.Min(sh-1, sy));
      double dT = -sy, dB = sy-(sh-1), dL = -sx, dR = sx-(sw-1);
      double[] cT = top[cx], cB = bot[cx], cL = lef[cy], cR = rig[cy];
      
      double wT = dT>0?dT:0, wB = dB>0?dB:0, wL = dL>0?dL:0, wR = dR>0?dR:0;
      bool outside = wT+wB+wL+wR > 0;
      double[] ext = new double[3];
      {
        
        double sum = wT+wB+wL+wR;
        if (!outside) { double m = padDist(sx, sy);
          if (m == sy) { wT=1; } else if (m == sh-1-sy) { wB=1; } else if (m == sx) { wL=1; } else { wR=1; } sum=1; }
        for (int ch = 0; ch < 3; ch++) {
          double fT = Math.Min(1.0, Math.Max(0,dT)/220.0), fB = Math.Min(1.0, Math.Max(0,dB)/220.0);
          double fL = Math.Min(1.0, Math.Max(0,dL)/120.0), fR = Math.Min(1.0, Math.Max(0,dR)/120.0);
          double vT = cT[ch]*(1-fT)+aT[ch]*fT, vB = cB[ch]*(1-fB)+aB[ch]*fB, vL = cL[ch]*(1-fL)+aL[ch]*fL, vR = cR[ch]*(1-fR)+aR[ch]*fR;
          ext[ch] = (vT*wT + vB*wB + vL*wL + vR*wR) / sum;
        }
      }
      if (outside) { for (int ch=0;ch<3;ch++) o[i+ch]=(byte)Math.Max(0,Math.Min(255,Math.Round(ext[ch]))); }
      else {
        double m = padDist(sx, sy);
        double a = m >= feather ? 1.0 : m / (double)feather;   
        for (int ch=0;ch<3;ch++) { double v = px(sx,sy,ch)*a + ext[ch]*(1-a); o[i+ch]=(byte)Math.Max(0,Math.Min(255,Math.Round(v))); }
      }
      o[i+3] = 255;
    }
    var bmp = new Bitmap(W, H, PixelFormat.Format32bppArgb);
    var bd = bmp.LockBits(new Rectangle(0,0,W,H), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
    Marshal.Copy(o, 0, bd.Scan0, o.Length); bmp.UnlockBits(bd);
    return bmp;
  }
}
"@
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$p = New-Object System.Drawing.Imaging.EncoderParameters 1
$p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 84L
foreach ($n in $Names) {
  $src = [System.Drawing.Bitmap]::FromFile((Join-Path $SrcDir "splash-$n.jpg"))
  $out = [Pad]::Run($src, $Grow, [bool]$AnchorTop)
  $dst = Join-Path $OutDir "splash-$n-s.jpg"
  $out.Save($dst, $enc, $p)
  "{0}: {1}x{2} -> {3}x{4} {5}KB" -f $n, $src.Width, $src.Height, $out.Width, $out.Height, [int]((Get-Item $dst).Length/1024)
  $src.Dispose(); $out.Dispose()
}
