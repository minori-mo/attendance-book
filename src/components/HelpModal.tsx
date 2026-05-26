import { useEffect, useRef } from "react";

interface Props {
  onClose: () => void;
}

function HelpModal({ onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="modal-overlay"
      onMouseDown={e => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="help-modal">
        <div className="help-modal-header">
          <h2>使い方</h2>
          <button className="help-close-btn" onClick={onClose}>×</button>
        </div>
        <div className="help-modal-body">

          <section>
            <h3>初期設定の流れ</h3>
            <ol>
              <li><strong>授業登録</strong>（時間割管理）→ <strong>時間割作成</strong>（時間割管理）→ <strong>クラス登録</strong>（クラス管理）→ <strong>生徒登録</strong>（生徒管理）の順に行ってください。</li>
            </ol>
          </section>

          <section>
            <h3>授業登録</h3>
            <ul>
              <li>「時間割管理」タブ左側の「授業登録」欄に授業名を入力し、<strong>＋ボタン</strong>または Enter で追加します。</li>
              <li>同じ名前の授業は登録できません。</li>
              <li>授業を削除すると、その授業が設定されていた時間割のコマも削除されます。</li>
            </ul>
          </section>

          <section>
            <h3>時間割の作成</h3>
            <ul>
              <li>「時間割管理」タブで<strong>「＋ 追加」</strong>ボタンを押して時間割を作成します。</li>
              <li>グリッドの各セルから授業を選択し（行＝時限、列＝曜日）、<strong>「保存」</strong>ボタンを押します。</li>
              <li>前期・後期など複数の時間割を作成できます。</li>
            </ul>
          </section>

          <section>
            <h3>日々の出席入力</h3>
            <h4>① 時間割を設定する</h4>
            <ul>
              <li>「出席入力」画面のカレンダーで<strong>日付ヘッダー（数字部分）をクリック</strong>すると、その日の時間割を設定できます。</li>
              <li>時間割が設定された日には<strong>青い点（●）</strong>が表示されます。</li>
            </ul>
            <h4>② 特定日の時間割を手動で設定する</h4>
            <ul>
              <li>日付ヘッダーをクリックし、ポップアップ下部の<strong>「時間割を手動で設定」</strong>ボタンを押します。</li>
              <li>0〜10時限それぞれの授業をドロップダウンで選択し、<strong>「保存」</strong>を押します。</li>
              <li>手動設定された日には<strong>オレンジの点（●）</strong>が表示されます。</li>
              <li>「手動設定を削除」を押すと通常の時間割に戻ります（その日の授業出席記録も削除されます）。</li>
            </ul>
            <h4>③ 出欠を記録する</h4>
            <ul>
              <li>生徒・日付の<strong>セルをクリック</strong>してモーダルを開き、出欠の種別にチェックを入れます。</li>
            </ul>
            <table>
              <thead>
                <tr><th>区分</th><th>略称</th><th>内容</th></tr>
              </thead>
              <tbody>
                <tr><td>欠席</td><td>欠</td><td>終日欠席</td></tr>
                <tr><td>遅刻</td><td>遅</td><td>授業開始後に登校</td></tr>
                <tr><td>早退</td><td>早</td><td>授業終了前に下校</td></tr>
                <tr><td>公欠</td><td>公</td><td>学校行事・部活動など公認の欠席</td></tr>
                <tr><td>忌引</td><td>忌</td><td>親族の不幸による欠席</td></tr>
              </tbody>
            </table>
            <h4>④ 授業ごとの出席を記録する</h4>
            <ul>
              <li>出欠にチェックを入れると、モーダル右側に「授業出席」欄が表示されます。</li>
              <li>実際に<strong>出席した授業</strong>にチェックを入れてください。</li>
              <li>時間割（または手動設定）が設定されていない日は授業出席の入力ができません。</li>
            </ul>
          </section>

          <section>
            <h3>集計列</h3>
            <ul>
              <li>カレンダー右側に欠席理由・欠席授業の集計が表示されます。</li>
              <li>「集計を隠す」ボタンで非表示にできます。</li>
            </ul>
          </section>

          <section>
            <h3>Excel出力</h3>
            <ul>
              <li>「出席入力」画面の<strong>「Excel出力」ボタン</strong>を押すと、出席カレンダーと集計の2シートが出力されます。</li>
            </ul>
          </section>

        </div>
      </div>
    </div>
  );
}

export default HelpModal;
