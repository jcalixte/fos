# Field of Strategy III — Design (QFD)

How the game's player-facing goals cascade into things the system must do, what gets built to
do them, and what was traded away. Vocabulary is owned by [CONTEXT.md](./CONTEXT.md) and is used
here verbatim — this document names Goals, Functions and Components but never redefines a term.
Hard-to-reverse decisions live in [docs/adr/](./docs/adr/); this is the index that shows where
they sit in the cascade.

Scope is a single battle, fought by one **Commander** or by two
([ADR-0013](./docs/adr/0013-a-battle-with-two-commanders-lives-on-a-server.md)). A **Campaign**
groups the battles on offer and does nothing else; *campaign persistence* — anything at all
crossing from one battle to the next — and anything above the Unit are out.

**Decisions are cross-checked against two nominal battles, both from the First Italian Campaign.**
**Castiglione (5 Aug 1796)** is the everyday case — open rolling ground, all three Arms manoeuvring
in Formation, one Arrival, one piece of Key Ground. **Rivoli (14 Jan 1797)** is the ceiling — the
Field at its size limit, 200m of relief, impassability by gradient, a Crossing formed by a gorge,
several Arrivals. Mechanics the campaign under-exercises — cavalry catching infantry unformed,
above all — are checked against purpose-built fixtures instead, because testing a mechanic by
hoping a historical battle happens to contain it is testing by coincidence.

Strength weights used in matrices: **9** strong, **3** medium, **1** weak, blank none.

---

## House of Quality

The same data as §§1–2, §5 and §6, in one picture: the nine goals and their weights down the left, the twenty-four functions across the top, the relation matrix in the body, the function-versus-function correlations in the roof, and the derived engineering priorities in the basement. The **relative weight** row is where the effort should go.

```tikz
\usetikzlibrary{arrows.meta, positioning, shapes.geometric, shapes.misc, calc, fit, backgrounds}

\newif\ifqfdshowroof          \qfdshowrooftrue
\newif\ifqfdshowbasement      \qfdshowbasementtrue
\newif\ifqfdshowcompetitive   \qfdshowcompetitivetrue
\newif\ifqfdshowlegend        \qfdshowlegendtrue
\newif\ifqfdshowimportance    \qfdshowimportancetrue
\newif\ifqfdshowcorrlegend    \qfdshowcorrlegendtrue
\newif\ifqfdshowevallegend    \qfdshowevallegendtrue
\newif\ifqfdshowtitle         \qfdshowtitletrue

\def\qfdNW{5}
\def\qfdNH{5}
\def\qfdWhatW{4.0}
\def\qfdImpW{0.9}
\def\qfdCmpW{3}
\def\qfdHdrH{2.6}
\def\qfdBasementN{4}

\def\qfdWhatsTitle{Customer needs}
\def\qfdImpTitle{Imp.\ \%}
\def\qfdPerceptionTitle{Comparative evaluation}
\def\qfdPoorLabel{poor}
\def\qfdExcellentLabel{excellent}
\def\qfdAltOneLabel{Our product}
\def\qfdAltTwoLabel{Competitor A}
\def\qfdAltThreeLabel{Competitor B}
\def\qfdRelTitle{Relation}
\def\qfdCorrTitle{Correlation}
\def\qfdEvalTitle{Evaluation}
\def\qfdProjectTitle{}
\def\qfdConcept{}

\tikzset{
  qfdthin/.style ={line width=0.35pt},
  qfdmed/.style  ={line width=0.7pt},
  qfdstrong/.style={circle, draw, fill=black,
                    minimum size=7pt, inner sep=0pt},
  qfdmod/.style  ={circle, draw,
                    minimum size=7pt, inner sep=0pt, line width=0.8pt},
  qfdweak/.style ={regular polygon, regular polygon sides=3, draw,
                    minimum size=8.5pt, inner sep=0pt, line width=0.7pt},
  qfdrel/.is choice,
  qfdrel/S/.style={qfdstrong},
  qfdrel/M/.style={qfdmod},
  qfdrel/W/.style={qfdweak},
  qfdalt1mk/.style={circle, draw, fill=black,
                    minimum size=6pt, inner sep=0pt, line width=1pt},
  qfdalt1ln/.style={line width=1.2pt},
  qfdalt2mk/.style={regular polygon, regular polygon sides=3, draw,
                    fill=black, minimum size=6pt, inner sep=0pt,
                    line width=0.7pt},
  qfdalt2ln/.style={line width=0.7pt, dashed},
  qfdalt3mk/.style={rectangle, draw, fill=black,
                    minimum size=5pt, inner sep=0pt, line width=0.7pt},
  qfdalt3ln/.style={line width=0.7pt, dotted},
}

\newcommand{\qfdDrawGrid}{%
  \foreach \c in {1,...,\qfdNHm} \draw[qfdthin] (\c, 0) -- (\c, -\qfdNW);
  \foreach \r in {1,...,\qfdNWm} \draw[qfdthin] (0, -\r) -- (\qfdNH, -\r);
  \foreach \r in {1,...,\qfdNWm}
    \draw[qfdthin] (\qfdLeftEdge, -\r) -- (0, -\r);
  \ifqfdshowroof
    \foreach \c in {1,...,\qfdNHm}
      \draw[qfdthin] (\c, 0) -- (\c, \qfdHdrH);
  \fi
  \ifqfdshowcompetitive
    \foreach \r in {1,...,\qfdNWm}
      \draw[qfdthin] (\qfdNH, -\r) -- (\qfdNH+\qfdCmpW, -\r);
  \fi
  \ifqfdshowbasement
    \foreach \r in {1,...,\qfdBasementN}
      \draw[qfdthin] (0, -\qfdNW-\r) -- (\qfdNH, -\qfdNW-\r);
    \foreach \c in {1,...,\qfdNHm}
      \draw[qfdthin] (\c, -\qfdNW) -- (\c, -\qfdNW-\qfdBasementN);
  \fi
}

\newcommand{\qfdDrawRoof}{%
  \ifqfdshowroof
    \foreach \k in {1,...,\qfdNHm} {%
      \pgfmathsetmacro{\rx}{(\k+\qfdNH)/2}
      \pgfmathsetmacro{\ry}{\qfdHdrH + (\qfdNH-\k)/2}
      \pgfmathsetmacro{\lx}{\k/2}
      \pgfmathsetmacro{\ly}{\qfdHdrH + \k/2}
      \draw[qfdthin] (\k, \qfdHdrH) -- (\rx, \ry);
      \draw[qfdthin] (\k, \qfdHdrH) -- (\lx, \ly);
    }%
    \draw[qfdmed] (0, \qfdHdrH)
       -- (\qfdNH/2, \qfdApexY) -- (\qfdNH, \qfdHdrH);
    \foreach \i in {1,...,\qfdNH}
      \foreach \k in {1,...,\qfdNH} {%
        \pgfmathtruncatemacro{\jj}{\i+\k}
        \ifnum\jj>\qfdNH\relax\else
          \pgfmathsetmacro{\xx}{\i + \k/2 - 0.5}
          \pgfmathsetmacro{\yy}{\qfdHdrH + \k/2}
          \coordinate (C-\i-\jj) at (\xx, \yy);
        \fi
      }%
  \fi
}

\newcommand{\qfdDrawScale}{%
  \ifqfdshowcompetitive
    \foreach \tk in {0,1,2,3,4,5} {%
      \pgfmathsetmacro{\tx}{\qfdNH + (\tk+0.5)*\qfdCmpW/6}
      \node[anchor=south, font=\scriptsize] at (\tx, 0.02) {\tk};
    }%
    \node[anchor=south, font=\scriptsize\bfseries, align=center]
         at ({\qfdNH + \qfdCmpW/2}, 0.7) {\qfdPerceptionTitle};
    \node[anchor=north, font=\scriptsize\itshape]
         at ({\qfdNH + 0.45}, -\qfdNW) {\qfdPoorLabel};
    \node[anchor=north, font=\scriptsize\itshape]
         at ({\qfdNH + \qfdCmpW - 0.45}, -\qfdNW) {\qfdExcellentLabel};
  \fi
}

\newcommand{\qfdDrawZoneTitles}{%
  \ifqfdshowimportance
    \node[rotate=90, anchor=west, font=\footnotesize\bfseries]
         at ({-\qfdImpW/2}, 0.12) {\qfdImpTitle};
  \fi
  \node[font=\scriptsize\bfseries, align=center, text width=\qfdWhatW cm]
       at ({\qfdLeftEdge + \qfdWhatW/2},
           {\ifqfdshowroof \qfdHdrH/2 \else 0.6 \fi}) {\qfdWhatsTitle};
}

\newcommand{\qfdDrawTitle}{%
  \ifqfdshowtitle
    \ifx\qfdProjectTitle\empty\else
      \pgfmathsetmacro{\qfdTitleX}{\qfdNH/2}
      \pgfmathsetmacro{\qfdTitleY}{\ifqfdshowroof \qfdApexY \else \qfdHdrH \fi + 0.9}
      \pgfmathsetmacro{\qfdSubW}{\qfdNH + 2}
      \node[anchor=south, font=\large\bfseries, align=center]
           at (\qfdTitleX, \qfdTitleY) {\qfdProjectTitle};
      \ifx\qfdConcept\empty\else
        \node[anchor=north, font=\footnotesize\itshape, align=center,
              text width=\qfdSubW cm]
             at (\qfdTitleX, {\qfdTitleY - 0.1}) {\qfdConcept};
      \fi
    \fi
  \fi
}

\newcommand{\qfdDrawFrames}{%
  \begin{scope}[qfdmed]
    \draw (\qfdLeftEdge, 0) rectangle (\qfdNH, -\qfdNW);
    \ifqfdshowimportance \draw (-\qfdImpW, 0) -- (-\qfdImpW, -\qfdNW); \fi
    \draw (0, 0) -- (0, -\qfdNW);
    \ifqfdshowroof
      \draw (0, 0) rectangle (\qfdNH, \qfdHdrH); \fi
    \ifqfdshowbasement
      \draw (0, -\qfdNW) rectangle (\qfdNH, -\qfdNW-\qfdBasementN); \fi
    \ifqfdshowcompetitive
      \draw (\qfdNH, 0) rectangle (\qfdNH+\qfdCmpW, -\qfdNW); \fi
  \end{scope}
}

\newcommand{\qfdDrawLegend}{%
  \ifqfdshowlegend
    \pgfmathsetmacro{\qfdLegX}{%
      \qfdNH + \ifqfdshowcompetitive \qfdCmpW + 0.7 \else 0.7 \fi}
    \pgfmathsetmacro{\qfdLegBottom}{%
      -2.05
      \ifqfdshowroof    \ifqfdshowcorrlegend - 2.55 \fi \fi
      \ifqfdshowcompetitive \ifqfdshowevallegend - 2.20 \fi \fi}
    \pgfmathsetmacro{\qfdLegY}{\qfdHdrH - 0.4}
    \begin{scope}[shift={(\qfdLegX, \qfdLegY)}]
      \draw[qfdmed, rounded corners=2pt]
        (-0.15, 0.4) rectangle (4.5, \qfdLegBottom);
      \node[anchor=west, font=\footnotesize\bfseries] at (0, 0.1)
        {\qfdRelTitle};
      \draw[qfdthin] (0, -0.15) -- (4.35, -0.15);
      \node[qfdstrong] at (0.22, -0.5)  {};
        \node[anchor=west] at (0.5, -0.5)  {Strong (9)};
      \node[qfdmod]    at (0.22, -0.95) {};
        \node[anchor=west] at (0.5, -0.95) {Medium (3)};
      \node[qfdweak]   at (0.22, -1.4)  {};
        \node[anchor=west] at (0.5, -1.4)  {Weak (1)};
      \ifqfdshowroof \ifqfdshowcorrlegend
        \node[anchor=west, font=\footnotesize\bfseries] at (0, -2.10)
          {\qfdCorrTitle};
        \draw[qfdthin] (0, -2.35) -- (4.35, -2.35);
        \node[anchor=west] at (0, -2.70) {{$+\!+$}\quad very positive};
        \node[anchor=west] at (0, -3.05) {{$+$\phantom{$+$}}\quad positive};
        \node[anchor=west] at (0, -3.40) {{$-$\phantom{$-$}}\quad negative};
        \node[anchor=west] at (0, -3.75) {{$-\!-$}\quad very negative};
      \fi \fi
      \ifqfdshowcompetitive \ifqfdshowevallegend
        \pgfmathsetmacro{\qfdEvalTop}{%
          -2.10 \ifqfdshowroof\ifqfdshowcorrlegend - 2.55 \fi\fi}
        \node[anchor=west, font=\footnotesize\bfseries]
          at (0, \qfdEvalTop) {\qfdEvalTitle};
        \pgfmathsetmacro{\qfdEvalSep}{\qfdEvalTop - 0.25}
        \draw[qfdthin] (0, \qfdEvalSep) -- (4.35, \qfdEvalSep);
        \pgfmathsetmacro{\qfdLegA}{\qfdEvalTop - 0.55}
        \draw[qfdalt1ln] (0.05, \qfdLegA) -- (0.45, \qfdLegA);
          \node[qfdalt1mk] at (0.25, \qfdLegA) {};
          \node[anchor=west, font=\bfseries] at (0.55, \qfdLegA)
            {\qfdAltOneLabel};
        \pgfmathsetmacro{\qfdLegB}{\qfdEvalTop - 0.95}
        \draw[qfdalt2ln] (0.05, \qfdLegB) -- (0.45, \qfdLegB);
          \node[qfdalt2mk] at (0.25, \qfdLegB) {};
          \node[anchor=west] at (0.55, \qfdLegB) {\qfdAltTwoLabel};
        \pgfmathsetmacro{\qfdLegC}{\qfdEvalTop - 1.35}
        \draw[qfdalt3ln] (0.05, \qfdLegC) -- (0.45, \qfdLegC);
          \node[qfdalt3mk] at (0.25, \qfdLegC) {};
          \node[anchor=west] at (0.55, \qfdLegC) {\qfdAltThreeLabel};
      \fi \fi
    \end{scope}
  \fi
}

\newenvironment{qfdhouse}{%
  \begin{tikzpicture}[x=1cm, y=1cm, font=\scriptsize,
                      line cap=round, line join=round]
  \ifqfdshowimportance
    \pgfmathsetmacro{\qfdLeftEdge}{-\qfdWhatW-\qfdImpW}
  \else
    \pgfmathsetmacro{\qfdLeftEdge}{-\qfdWhatW}
  \fi
  \pgfmathsetmacro{\qfdApexY}{\qfdHdrH + \qfdNH/2}
  \pgfmathtruncatemacro{\qfdNHm}{\qfdNH - 1}
  \pgfmathtruncatemacro{\qfdNWm}{\qfdNW - 1}
  \qfdDrawGrid
  \qfdDrawRoof
  \qfdDrawScale
  \qfdDrawZoneTitles
  \qfdDrawTitle
}{%
  \qfdDrawFrames
  \qfdDrawLegend
  \end{tikzpicture}%
}

\def\qfdNW{9}
\def\qfdNH{24}
\def\qfdWhatW{4.4}
\def\qfdHdrH{3.7}
\def\qfdImpTitle{Weight}
\def\qfdWhatsTitle{Player goals \textemdash{} the WHATs}
\qfdshowcompetitivefalse
\def\qfdProjectTitle{Field of Strategy III}
\def\qfdConcept{Real-time \textbf{Napoleonic} battles in which an \textbf{Order} is a \textbf{Courier} who has to ride there, a \textbf{Unit} looks after itself until he arrives, and the tactics of the period fall out of \textbf{geometry} rather than rules.}

\begin{document}
\begin{qfdhouse}
  % --- WHATs and weights ---
  \pgfmathsetmacro{\qfdWhatTextW}{\qfdWhatW - 0.2}
  \node[anchor=west, font=\scriptsize, text width=\qfdWhatTextW cm, align=left]
    at ({\qfdLeftEdge + 0.1}, {-1 + 0.5}) {Commander, not puppeteer};
  \node[anchor=west, font=\scriptsize, text width=\qfdWhatTextW cm, align=left]
    at ({\qfdLeftEdge + 0.1}, {-2 + 0.5}) {Reads at a glance};
  \node[anchor=west, font=\scriptsize, text width=\qfdWhatTextW cm, align=left]
    at ({\qfdLeftEdge + 0.1}, {-3 + 0.5}) {Period tactics win};
  \node[anchor=west, font=\scriptsize, text width=\qfdWhatTextW cm, align=left]
    at ({\qfdLeftEdge + 0.1}, {-4 + 0.5}) {A battle has shape};
  \node[anchor=west, font=\scriptsize, text width=\qfdWhatTextW cm, align=left]
    at ({\qfdLeftEdge + 0.1}, {-5 + 0.5}) {Authorable as data};
  \node[anchor=west, font=\scriptsize, text width=\qfdWhatTextW cm, align=left]
    at ({\qfdLeftEdge + 0.1}, {-6 + 0.5}) {A link you can hand over};
  \node[anchor=west, font=\scriptsize, text width=\qfdWhatTextW cm, align=left]
    at ({\qfdLeftEdge + 0.1}, {-7 + 0.5}) {Good to watch};
  \node[anchor=west, font=\scriptsize, text width=\qfdWhatTextW cm, align=left]
    at ({\qfdLeftEdge + 0.1}, {-8 + 0.5}) {Worth fighting twice};
  \node[anchor=west, font=\scriptsize, text width=\qfdWhatTextW cm, align=left]
    at ({\qfdLeftEdge + 0.1}, {-9 + 0.5}) {Teaches its own marks};
  \node[font=\scriptsize] at ({-\qfdImpW/2}, {-1 + 0.5}) {10};
  \node[font=\scriptsize] at ({-\qfdImpW/2}, {-2 + 0.5}) {9};
  \node[font=\scriptsize] at ({-\qfdImpW/2}, {-3 + 0.5}) {9};
  \node[font=\scriptsize] at ({-\qfdImpW/2}, {-4 + 0.5}) {8};
  \node[font=\scriptsize] at ({-\qfdImpW/2}, {-5 + 0.5}) {7};
  \node[font=\scriptsize] at ({-\qfdImpW/2}, {-6 + 0.5}) {5};
  \node[font=\scriptsize] at ({-\qfdImpW/2}, {-7 + 0.5}) {8};
  \node[font=\scriptsize] at ({-\qfdImpW/2}, {-8 + 0.5}) {7};
  \node[font=\scriptsize] at ({-\qfdImpW/2}, {-9 + 0.5}) {5};

  % --- HOWs ---
  \node[rotate=90, anchor=west, font=\scriptsize] at ({1 - 0.5}, 0.15) {F1~Order on courier time};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({2 - 0.5}, 0.15) {F2~Pending Orders shown};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({3 - 0.5}, 0.15) {F3~Initiative};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({4 - 0.5}, 0.15) {F4~Routing};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({5 - 0.5}, 0.15) {F5~Silhouette read};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({6 - 0.5}, 0.15) {F6~Field on one screen};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({7 - 0.5}, 0.15) {F7~Dispatches with cause};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({8 - 0.5}, 0.15) {F8~Effects from geometry};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({9 - 0.5}, 0.15) {F9~Discrete fire events};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({10 - 0.5}, 0.15) {F10~Morale decides};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({11 - 0.5}, 0.15) {F11~Break or clock ends it};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({12 - 0.5}, 0.15) {F12~Formation morph};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({13 - 0.5}, 0.15) {F13~Flash and smoke};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({14 - 0.5}, 0.15) {F14~Render interpolation};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({15 - 0.5}, 0.15) {F15~Sound per event};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({16 - 0.5}, 0.15) {F16~Scenario from data};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({17 - 0.5}, 0.15) {F17~Terrain painted};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({18 - 0.5}, 0.15) {F18~Identical replay};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({19 - 0.5}, 0.15) {F19~Static build};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({20 - 0.5}, 0.15) {F20~Arrival};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({21 - 0.5}, 0.15) {F21~Two Commanders};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({22 - 0.5}, 0.15) {F22~The cut};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({23 - 0.5}, 0.15) {F23~Blind Deployment};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({24 - 0.5}, 0.15) {F24~Out of Contact};

  % --- Relations ---
  \node[qfdrel/S] at ({1 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/S] at ({2 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/S] at ({3 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/M] at ({4 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/W] at ({5 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/M] at ({6 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/M] at ({7 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/W] at ({9 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/W] at ({10 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/W] at ({12 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/W] at ({13 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/W] at ({15 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/W] at ({20 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/M] at ({21 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/M] at ({22 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/W] at ({23 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/W] at ({24 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/S] at ({2 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/W] at ({3 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/S] at ({5 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/S] at ({6 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/S] at ({7 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/M] at ({8 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/M] at ({9 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/W] at ({10 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/M] at ({12 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/S] at ({13 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/M] at ({14 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/M] at ({15 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/W] at ({20 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/W] at ({22 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/M] at ({1 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/S] at ({3 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/M] at ({4 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/M] at ({7 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/S] at ({8 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/S] at ({9 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/S] at ({10 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/M] at ({11 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/W] at ({12 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/M] at ({16 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/M] at ({17 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/S] at ({18 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/M] at ({20 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/M] at ({21 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/M] at ({22 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/M] at ({23 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/M] at ({1 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/M] at ({3 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/W] at ({4 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/W] at ({6 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/M] at ({7 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/M] at ({9 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/S] at ({10 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/S] at ({11 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/M] at ({15 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/M] at ({16 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/S] at ({20 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/M] at ({21 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/M] at ({23 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/W] at ({24 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/M] at ({3 - 0.5}, {-5 + 0.5}) {};
  \node[qfdrel/W] at ({6 - 0.5}, {-5 + 0.5}) {};
  \node[qfdrel/W] at ({7 - 0.5}, {-5 + 0.5}) {};
  \node[qfdrel/W] at ({8 - 0.5}, {-5 + 0.5}) {};
  \node[qfdrel/M] at ({11 - 0.5}, {-5 + 0.5}) {};
  \node[qfdrel/S] at ({16 - 0.5}, {-5 + 0.5}) {};
  \node[qfdrel/S] at ({17 - 0.5}, {-5 + 0.5}) {};
  \node[qfdrel/M] at ({18 - 0.5}, {-5 + 0.5}) {};
  \node[qfdrel/W] at ({19 - 0.5}, {-5 + 0.5}) {};
  \node[qfdrel/S] at ({20 - 0.5}, {-5 + 0.5}) {};
  \node[qfdrel/W] at ({6 - 0.5}, {-6 + 0.5}) {};
  \node[qfdrel/W] at ({16 - 0.5}, {-6 + 0.5}) {};
  \node[qfdrel/S] at ({19 - 0.5}, {-6 + 0.5}) {};
  \node[qfdrel/S] at ({21 - 0.5}, {-6 + 0.5}) {};
  \node[qfdrel/S] at ({24 - 0.5}, {-6 + 0.5}) {};
  \node[qfdrel/W] at ({1 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/M] at ({2 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/W] at ({3 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/W] at ({4 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/M] at ({5 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/M] at ({6 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/W] at ({7 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/M] at ({9 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/S] at ({12 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/S] at ({13 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/S] at ({14 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/S] at ({15 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/W] at ({20 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/W] at ({23 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/M] at ({1 - 0.5}, {-8 + 0.5}) {};
  \node[qfdrel/W] at ({2 - 0.5}, {-8 + 0.5}) {};
  \node[qfdrel/M] at ({3 - 0.5}, {-8 + 0.5}) {};
  \node[qfdrel/W] at ({7 - 0.5}, {-8 + 0.5}) {};
  \node[qfdrel/W] at ({8 - 0.5}, {-8 + 0.5}) {};
  \node[qfdrel/W] at ({10 - 0.5}, {-8 + 0.5}) {};
  \node[qfdrel/M] at ({11 - 0.5}, {-8 + 0.5}) {};
  \node[qfdrel/M] at ({19 - 0.5}, {-8 + 0.5}) {};
  \node[qfdrel/S] at ({21 - 0.5}, {-8 + 0.5}) {};
  \node[qfdrel/S] at ({22 - 0.5}, {-8 + 0.5}) {};
  \node[qfdrel/S] at ({23 - 0.5}, {-8 + 0.5}) {};
  \node[qfdrel/S] at ({24 - 0.5}, {-8 + 0.5}) {};
  \node[qfdrel/M] at ({2 - 0.5}, {-9 + 0.5}) {};
  \node[qfdrel/W] at ({3 - 0.5}, {-9 + 0.5}) {};
  \node[qfdrel/M] at ({5 - 0.5}, {-9 + 0.5}) {};
  \node[qfdrel/W] at ({6 - 0.5}, {-9 + 0.5}) {};
  \node[qfdrel/S] at ({7 - 0.5}, {-9 + 0.5}) {};
  \node[qfdrel/W] at ({10 - 0.5}, {-9 + 0.5}) {};
  \node[qfdrel/M] at ({12 - 0.5}, {-9 + 0.5}) {};
  \node[qfdrel/W] at ({13 - 0.5}, {-9 + 0.5}) {};
  \node[qfdrel/W] at ({14 - 0.5}, {-9 + 0.5}) {};
  \node[qfdrel/M] at ({15 - 0.5}, {-9 + 0.5}) {};
  \node[qfdrel/M] at ({16 - 0.5}, {-9 + 0.5}) {};

  % --- Roof correlations ---
  \node[font=\tiny] at (C-1-2) {$+\!+$};
  \node[font=\tiny] at (C-1-3) {$+\!+$};
  \node[font=\tiny] at (C-1-11) {$-$};
  \node[font=\tiny] at (C-1-15) {$+$};
  \node[font=\tiny] at (C-1-21) {$+$};
  \node[font=\tiny] at (C-2-3) {$+$};
  \node[font=\tiny] at (C-2-11) {$+$};
  \node[font=\tiny] at (C-2-13) {$-$};
  \node[font=\tiny] at (C-3-7) {$+\!+$};
  \node[font=\tiny] at (C-3-11) {$+$};
  \node[font=\tiny] at (C-3-24) {$+\!+$};
  \node[font=\tiny] at (C-4-20) {$+$};
  \node[font=\tiny] at (C-5-6) {$-$};
  \node[font=\tiny] at (C-5-12) {$+\!+$};
  \node[font=\tiny] at (C-5-13) {$-$};
  \node[font=\tiny] at (C-6-13) {$-$};
  \node[font=\tiny] at (C-6-14) {$+$};
  \node[font=\tiny] at (C-7-8) {$-$};
  \node[font=\tiny] at (C-7-22) {$-\!-$};
  \node[font=\tiny] at (C-8-9) {$+\!+$};
  \node[font=\tiny] at (C-8-10) {$-$};
  \node[font=\tiny] at (C-8-11) {$-$};
  \node[font=\tiny] at (C-8-18) {$+\!+$};
  \node[font=\tiny] at (C-9-13) {$+\!+$};
  \node[font=\tiny] at (C-9-15) {$+\!+$};
  \node[font=\tiny] at (C-10-11) {$+\!+$};
  \node[font=\tiny] at (C-11-20) {$-$};
  \node[font=\tiny] at (C-11-23) {$-$};
  \node[font=\tiny] at (C-11-24) {$+$};
  \node[font=\tiny] at (C-12-14) {$+\!+$};
  \node[font=\tiny] at (C-13-14) {$+$};
  \node[font=\tiny] at (C-14-18) {$-$};
  \node[font=\tiny] at (C-16-17) {$+\!+$};
  \node[font=\tiny] at (C-16-20) {$+\!+$};
  \node[font=\tiny] at (C-17-18) {$+$};
  \node[font=\tiny] at (C-18-21) {$-$};
  \node[font=\tiny] at (C-19-21) {$-\!-$};
  \node[font=\tiny] at (C-21-22) {$+\!+$};
  \node[font=\tiny] at (C-21-23) {$+\!+$};
  \node[font=\tiny] at (C-21-24) {$+\!+$};
  \node[font=\tiny] at (C-22-23) {$+\!+$};

  % --- Basement ---
  \node[font=\tiny] at ({1 - 0.5}, {-\qfdNW - 0.5}) {13 m/s};
  \node[font=\tiny] at ({1 - 0.5}, {-\qfdNW - 1.5}) {2};
  \node[font=\tiny] at ({1 - 0.5}, {-\qfdNW - 2.5}) {170};
  \node[font=\tiny\bfseries] at ({1 - 0.5}, {-\qfdNW - 3.5}) {4.8};
  \node[font=\tiny] at ({2 - 0.5}, {-\qfdNW - 0.5}) {100\%};
  \node[font=\tiny] at ({2 - 0.5}, {-\qfdNW - 1.5}) {2};
  \node[font=\tiny] at ({2 - 0.5}, {-\qfdNW - 2.5}) {217};
  \node[font=\tiny\bfseries] at ({2 - 0.5}, {-\qfdNW - 3.5}) {6.1};
  \node[font=\tiny] at ({3 - 0.5}, {-\qfdNW - 0.5}) {never idle};
  \node[font=\tiny] at ({3 - 0.5}, {-\qfdNW - 1.5}) {4};
  \node[font=\tiny] at ({3 - 0.5}, {-\qfdNW - 2.5}) {259};
  \node[font=\tiny\bfseries] at ({3 - 0.5}, {-\qfdNW - 3.5}) {7.3};
  \node[font=\tiny] at ({4 - 0.5}, {-\qfdNW - 0.5}) {$<$5 ms};
  \node[font=\tiny] at ({4 - 0.5}, {-\qfdNW - 1.5}) {3};
  \node[font=\tiny] at ({4 - 0.5}, {-\qfdNW - 2.5}) {73};
  \node[font=\tiny\bfseries] at ({4 - 0.5}, {-\qfdNW - 3.5}) {2.0};
  \node[font=\tiny] at ({5 - 0.5}, {-\qfdNW - 0.5}) {4 distinct};
  \node[font=\tiny] at ({5 - 0.5}, {-\qfdNW - 1.5}) {3};
  \node[font=\tiny] at ({5 - 0.5}, {-\qfdNW - 2.5}) {130};
  \node[font=\tiny\bfseries] at ({5 - 0.5}, {-\qfdNW - 3.5}) {3.6};
  \node[font=\tiny] at ({6 - 0.5}, {-\qfdNW - 0.5}) {1920 m};
  \node[font=\tiny] at ({6 - 0.5}, {-\qfdNW - 1.5}) {1};
  \node[font=\tiny] at ({6 - 0.5}, {-\qfdNW - 2.5}) {160};
  \node[font=\tiny\bfseries] at ({6 - 0.5}, {-\qfdNW - 3.5}) {4.5};
  \node[font=\tiny] at ({7 - 0.5}, {-\qfdNW - 0.5}) {every event};
  \node[font=\tiny] at ({7 - 0.5}, {-\qfdNW - 1.5}) {2};
  \node[font=\tiny] at ({7 - 0.5}, {-\qfdNW - 2.5}) {229};
  \node[font=\tiny\bfseries] at ({7 - 0.5}, {-\qfdNW - 3.5}) {6.4};
  \node[font=\tiny] at ({8 - 0.5}, {-\qfdNW - 0.5}) {0 constants};
  \node[font=\tiny] at ({8 - 0.5}, {-\qfdNW - 1.5}) {4};
  \node[font=\tiny] at ({8 - 0.5}, {-\qfdNW - 2.5}) {122};
  \node[font=\tiny\bfseries] at ({8 - 0.5}, {-\qfdNW - 3.5}) {3.4};
  \node[font=\tiny] at ({9 - 0.5}, {-\qfdNW - 0.5}) {20--25 s};
  \node[font=\tiny] at ({9 - 0.5}, {-\qfdNW - 1.5}) {3};
  \node[font=\tiny] at ({9 - 0.5}, {-\qfdNW - 2.5}) {166};
  \node[font=\tiny\bfseries] at ({9 - 0.5}, {-\qfdNW - 3.5}) {4.7};
  \node[font=\tiny] at ({10 - 0.5}, {-\qfdNW - 0.5}) {15--30\%};
  \node[font=\tiny] at ({10 - 0.5}, {-\qfdNW - 1.5}) {5};
  \node[font=\tiny] at ({10 - 0.5}, {-\qfdNW - 2.5}) {184};
  \node[font=\tiny\bfseries] at ({10 - 0.5}, {-\qfdNW - 3.5}) {5.2};
  \node[font=\tiny] at ({11 - 0.5}, {-\qfdNW - 0.5}) {20--40 min};
  \node[font=\tiny] at ({11 - 0.5}, {-\qfdNW - 1.5}) {3};
  \node[font=\tiny] at ({11 - 0.5}, {-\qfdNW - 2.5}) {141};
  \node[font=\tiny\bfseries] at ({11 - 0.5}, {-\qfdNW - 3.5}) {4.0};
  \node[font=\tiny] at ({12 - 0.5}, {-\qfdNW - 0.5}) {no pop};
  \node[font=\tiny] at ({12 - 0.5}, {-\qfdNW - 1.5}) {4};
  \node[font=\tiny] at ({12 - 0.5}, {-\qfdNW - 2.5}) {133};
  \node[font=\tiny\bfseries] at ({12 - 0.5}, {-\qfdNW - 3.5}) {3.7};
  \node[font=\tiny] at ({13 - 0.5}, {-\qfdNW - 0.5}) {1/Volley};
  \node[font=\tiny] at ({13 - 0.5}, {-\qfdNW - 1.5}) {2};
  \node[font=\tiny] at ({13 - 0.5}, {-\qfdNW - 2.5}) {168};
  \node[font=\tiny\bfseries] at ({13 - 0.5}, {-\qfdNW - 3.5}) {4.7};
  \node[font=\tiny] at ({14 - 0.5}, {-\qfdNW - 0.5}) {10/60 Hz};
  \node[font=\tiny] at ({14 - 0.5}, {-\qfdNW - 1.5}) {2};
  \node[font=\tiny] at ({14 - 0.5}, {-\qfdNW - 2.5}) {104};
  \node[font=\tiny\bfseries] at ({14 - 0.5}, {-\qfdNW - 3.5}) {2.9};
  \node[font=\tiny] at ({15 - 0.5}, {-\qfdNW - 0.5}) {6 events};
  \node[font=\tiny] at ({15 - 0.5}, {-\qfdNW - 1.5}) {2};
  \node[font=\tiny] at ({15 - 0.5}, {-\qfdNW - 2.5}) {148};
  \node[font=\tiny\bfseries] at ({15 - 0.5}, {-\qfdNW - 3.5}) {4.1};
  \node[font=\tiny] at ({16 - 0.5}, {-\qfdNW - 0.5}) {0 code};
  \node[font=\tiny] at ({16 - 0.5}, {-\qfdNW - 1.5}) {2};
  \node[font=\tiny] at ({16 - 0.5}, {-\qfdNW - 2.5}) {134};
  \node[font=\tiny\bfseries] at ({16 - 0.5}, {-\qfdNW - 3.5}) {3.8};
  \node[font=\tiny] at ({17 - 0.5}, {-\qfdNW - 0.5}) {$<$1 h};
  \node[font=\tiny] at ({17 - 0.5}, {-\qfdNW - 1.5}) {3};
  \node[font=\tiny] at ({17 - 0.5}, {-\qfdNW - 2.5}) {90};
  \node[font=\tiny\bfseries] at ({17 - 0.5}, {-\qfdNW - 3.5}) {2.5};
  \node[font=\tiny] at ({18 - 0.5}, {-\qfdNW - 0.5}) {bit-exact};
  \node[font=\tiny] at ({18 - 0.5}, {-\qfdNW - 1.5}) {3};
  \node[font=\tiny] at ({18 - 0.5}, {-\qfdNW - 2.5}) {102};
  \node[font=\tiny\bfseries] at ({18 - 0.5}, {-\qfdNW - 3.5}) {2.9};
  \node[font=\tiny] at ({19 - 0.5}, {-\qfdNW - 0.5}) {solo static};
  \node[font=\tiny] at ({19 - 0.5}, {-\qfdNW - 1.5}) {1};
  \node[font=\tiny] at ({19 - 0.5}, {-\qfdNW - 2.5}) {73};
  \node[font=\tiny\bfseries] at ({19 - 0.5}, {-\qfdNW - 3.5}) {2.0};
  \node[font=\tiny] at ({20 - 0.5}, {-\qfdNW - 0.5}) {clock/trig};
  \node[font=\tiny] at ({20 - 0.5}, {-\qfdNW - 1.5}) {3};
  \node[font=\tiny] at ({20 - 0.5}, {-\qfdNW - 2.5}) {189};
  \node[font=\tiny\bfseries] at ({20 - 0.5}, {-\qfdNW - 3.5}) {5.3};
  \node[font=\tiny] at ({21 - 0.5}, {-\qfdNW - 0.5}) {1 authority};
  \node[font=\tiny] at ({21 - 0.5}, {-\qfdNW - 1.5}) {4};
  \node[font=\tiny] at ({21 - 0.5}, {-\qfdNW - 2.5}) {189};
  \node[font=\tiny\bfseries] at ({21 - 0.5}, {-\qfdNW - 3.5}) {5.3};
  \node[font=\tiny] at ({22 - 0.5}, {-\qfdNW - 0.5}) {0 on the wire};
  \node[font=\tiny] at ({22 - 0.5}, {-\qfdNW - 1.5}) {2};
  \node[font=\tiny] at ({22 - 0.5}, {-\qfdNW - 2.5}) {129};
  \node[font=\tiny\bfseries] at ({22 - 0.5}, {-\qfdNW - 3.5}) {3.6};
  \node[font=\tiny] at ({23 - 0.5}, {-\qfdNW - 0.5}) {3 min};
  \node[font=\tiny] at ({23 - 0.5}, {-\qfdNW - 1.5}) {2};
  \node[font=\tiny] at ({23 - 0.5}, {-\qfdNW - 2.5}) {132};
  \node[font=\tiny\bfseries] at ({23 - 0.5}, {-\qfdNW - 3.5}) {3.7};
  \node[font=\tiny] at ({24 - 0.5}, {-\qfdNW - 0.5}) {no pause};
  \node[font=\tiny] at ({24 - 0.5}, {-\qfdNW - 1.5}) {3};
  \node[font=\tiny] at ({24 - 0.5}, {-\qfdNW - 2.5}) {126};
  \node[font=\tiny\bfseries] at ({24 - 0.5}, {-\qfdNW - 3.5}) {3.5};

  % --- Basement row labels ---
  \node[anchor=east, font=\scriptsize\bfseries] at (-0.15, {-\qfdNW - 0.5}) {Target};
  \node[anchor=east, font=\scriptsize\bfseries] at (-0.15, {-\qfdNW - 1.5}) {Difficulty (1--5)};
  \node[anchor=east, font=\scriptsize\bfseries] at (-0.15, {-\qfdNW - 2.5}) {Absolute weight};
  \node[anchor=east, font=\scriptsize\bfseries] at (-0.15, {-\qfdNW - 3.5}) {Relative weight \%};
\end{qfdhouse}
\end{document}
```

---

## 1. Goals — the WHATs

The **Commander** is someone who finds the period interesting and wants the game that doesn't exist
— essentially the author. Onboarding and teaching the period are deliberately not goals: he already
knows what a square is for. What he does not know is *this game's* vocabulary — that Morale is said
with the colour of the dressed edge — and that is G9, which is a different thing and weighted far
below the seven that make a battle worth having marks in at all.

G8 arrived by a route worth remembering. T3 recorded a cost — *"no adaptation; a battle is fresh
once or twice"* — and no Goal ever claimed it, so for six milestones nothing in the cascade pulled
against it. Tradeoffs are where this project files what it has decided not to fix, and nothing
re-reads a tradeoff. G9 is the same shape caught deliberately: T18 and T21 both close with *nothing
on screen teaches them*, and it now has a Goal above it rather than only a cost below.

| ID  | Goal                                                                                  | Weight | Source |
|-----|---------------------------------------------------------------------------------------|:------:|--------|
| G1  | You feel like a commander, not a puppeteer — you issue intent and watch it play out imperfectly | 10 | [ADR-0002](./docs/adr/0002-orders-are-couriered-from-a-headquarters.md) |
| G2  | The battlefield reads at a glance — silhouette and colour say what everything is doing, with no labels or menus | 9 | design session |
| G3  | Napoleonic tactics are the winning tactics — what worked in 1796 works here, what didn't, doesn't | 9 | [CONTEXT.md](./CONTEXT.md) |
| G4  | A battle has a shape — deployment, approach, crisis, collapse — inside 20–40 minutes    |   8    | design session |
| G5  | Scenarios are authorable as data, without touching code                                |   7    | [ADR-0003](./docs/adr/0003-typescript-with-a-pure-simulation-core.md) |
| G6  | It's a link you can hand someone                                                       |   5    | [ADR-0003](./docs/adr/0003-typescript-with-a-pure-simulation-core.md) |
| G7  | The battle is good to watch — everything moves continuously, changes happen visibly, and fire reads | 8 | design session |
| G8  | A battle is worth fighting more than once — the enemy is not the same enemy twice     |   7    | [ADR-0013](./docs/adr/0013-a-battle-with-two-commanders-lives-on-a-server.md) |
| G9  | The game teaches its own marks — what a thing means is learned from the game, in the period's voice | 5 | T18, T21, `HelpTip.vue` |

## 2. Functions — the HOWs

**Command** — serves G1

| ID  | Function                                    | Dir | Target |
|-----|---------------------------------------------|:---:|--------|
| F1  | Deliver an Order on courier time            |  →  | courier 13 m/s: 200m ≈ 15s, 1500m ≈ 115s |
| F2  | Show every pending Order on the Field       |  →  | 100% drawn as Courier + Ghost; zero hidden timers |
| F3  | Cover the gaps with Initiative              |  ↑  | never idle under threat — return fire, form square, Break, Rout, Rally, pick travelling Formation, and give or take as much ground as the Standing Order allows |
| F4  | Route a Unit to any reachable point         |  →  | funnels to Crossings; no manual waypointing required; pathfind under 10ms on 250×250 |

**Legibility** — serves G2

| ID  | Function                                    | Dir | Target |
|-----|---------------------------------------------|:---:|--------|
| F5  | Keep Formation readable from silhouette alone |  →  | 4 infantry silhouettes distinct at 1 px/m; Figure ≥ 3px |
| F6  | Hold the whole Field on one screen          |  →  | ≤1920m across, no camera controls |
| F7  | Report every consequential event as a Dispatch, with its cause |  ↑  | every Break, Rout, Rally, Charge outcome and Order arrival **in the Commander's own army**, each naming why |

**Fidelity** — serves G3

| ID  | Function                                    | Dir | Target |
|-----|---------------------------------------------|:---:|--------|
| F8  | Derive combat effect from geometry, not per-Formation constants |  ↑  | zero hard-coded Formation bonuses |
| F9  | Resolve fighting as discrete events on historical clocks |  →  | Volley 20–25s, gun 30–60s, Contact ≤30s |
| F10 | Let Morale decide a Unit's fate, not Strength |  →  | Break at 15–30% casualties; a Unit reaching 0 Strength is a bug |

**Pacing** — serves G4

| ID  | Function                                    | Dir | Target |
|-----|---------------------------------------------|:---:|--------|
| F11 | End a battle on the clock, Army Break under it |  →  | the clock's full length at Tempo 1, 20–40 min; never by annihilation |
| F20 | Bring Units onto the Field mid-battle       |  →  | Arrival by clock time or trigger, at a named point or Field edge |

**Watchability** — serves G7

| ID  | Function                                    | Dir | Target |
|-----|---------------------------------------------|:---:|--------|
| F12 | Morph a Unit's slot layout through a Formation change |  →  | rendered across the transition's full duration; nothing pops |
| F13 | Render every Volley as flash and Powder Smoke |  →  | one flash and one drifting cloud per Volley |
| F14 | Interpolate rendering between simulation states |  →  | sim 10Hz, render 60fps, zero judder |
| F15 | Sound every battle event                    |  →  | distinct sound per Volley, gun, Charge, Contact, Rout, Order arrival |

**Authoring & shipping** — serves G5, G6

| ID  | Function                                    | Dir | Target |
|-----|---------------------------------------------|:---:|--------|
| F16 | Load Scenario, Field and Roster entirely from data |  →  | zero code changes to add a battle |
| F17 | Author a Field without hand-editing data    |  ↓  | a 250×250 Field in under an hour |
| F18 | Replay a battle identically from Scenario and seed |  →  | bit-identical outcome **per JavaScript engine** ([ADR-0014](./docs/adr/0014-one-javascript-engine-for-the-simulation.md)) |
| F19 | Build to a static site                      |  →  | a solo battle is static assets and no server; a two-Commander battle is one process ([ADR-0013](./docs/adr/0013-a-battle-with-two-commanders-lives-on-a-server.md)) |

**Opposition** — serves G8

| ID  | Function                                    | Dir | Target |
|-----|---------------------------------------------|:---:|--------|
| F21 | Advance one battle for two Commanders       |  →  | one authority, one clock; Tempo is the slower of the two asked for; an Order accepted only from the Commander whose Army it names; round trip under one 100ms step — 0.3% of a 15s Courier ride |
| F22 | Send each Commander only what is his        |  →  | zero enemy Reports, Ghosts, Couriers or Dispatches *on the wire* — withheld, not merely undrawn |
| F23 | Arrange both armies blind, and start on a barrier |  →  | neither army visible to the other until both have Stood To; Deployment ends on both, or on a 3-minute clock, whichever comes first |
| F24 | Survive a Commander going Out of Contact    |  →  | the clock never pauses; the army fights on its Standing Orders; the seat is recoverable at the same address |

## 4. Cascade — Goals → Functions → How → Components

- **G1** commander, not puppeteer  _W:10_
  - **F1** Deliver an Order on courier time — **How**: an Order is a message stamped with an arrival time, never a call on a Unit; the ride is measured from a Headquarters the player may move and the enemy may come at, so *where do I stand* is asked all afternoon and not once (ADR-0008) → C1, C8
  - **F2** Show every pending Order — **How**: draw the Courier riding and a Ghost at its destination → C11, C15
  - **F3** Cover the gaps with Initiative — **How**: ordered priority rule list, first match wins, *suspending* the live Order rather than cancelling it, gated by the Unit's Standing Order and leashed in metres from its Post → C2 _(rejected: behaviour tree, utility scoring — see T14; unbounded hunting — see T16)_
  - **F4** Route a Unit anywhere reachable — **How**: A* over cells with Ground and gradient costs, string-pulled to a few waypoints; Crossings funnel for free because water costs ∞ and a bridge cell does not → C5, C4
- **G2** reads at a glance  _W:9_
  - **F5** Formation readable from silhouette — **How**: the four infantry Formations already have distinct outlines; draw an army-coloured base with Figures as texture, and floor a Figure at 3px so a line never collapses to 2px → C3, C10
  - **F6** Whole Field on one screen — **How**: fixed camera, 1 px/m, no zoom, no pan; Field sized to the window → C9 _(rejected: zoom + pan — see T8)_
  - **F7** Dispatches with cause — **How**: the Initiative rule that fired *is* the reason, so causes come free rather than needing an explanation layer → C12, C2
- **G3** period tactics win  _W:9_
  - **F8** Effects from geometry, not constants — **How**: Frontage, depth and Face derived from Strength, ranks and spacing; a column is butchered by roundshot because it *is* deep, and a square resists cavalry because it *has* no flank → C3, C6
  - **F9** Discrete events on historical clocks — **How**: Volley on a reload clock, Charge as a resolved sequence, Contact decided in seconds → C6, C8
  - **F10** Morale decides, not Strength — **How**: casualties are one input to Morale and Fatigue is the other, bought by the pace a Unit is asked for rather than by anything done to it (ADR-0010); Break, Rout, Rally and a falling Morale Ceiling do the rest → C7
- **G4** a battle has shape  _W:8_
  - **F11** End on the clock, Army Break under it — **How**: a Scenario clock, then Key Ground counted and condition where it is even; and a floor at every Unit of an army Broken (ADR-0006) → C7, C8
  - **F20** Arrival — **How**: Roster entries that enter at a named point or Field edge on clock time or trigger → C8, C14, C5
- **G5** authorable as data  _W:7_
  - **F16** Scenario, Field and Roster from data — **How**: Rosters are standalone files a Scenario names, so persistence later is writing them back out → C14
  - **F17** Author a Field without hand-editing data — **How**: `height.png` (low-res, upsampled) + `ground.png` (full-res) painted in any image editor over a traced historical map; discrete objects in `scenario.json` → C14, C4 _(rejected: build a tile editor — see T5)_
  - **F18** Identical replay from Scenario + seed — **How**: pure sim module, fixed 10Hz timestep, seeded RNG — and one engine, because `sin`, `cos`, `hypot` and `atan2` are approximated per implementation, so the tests run on whatever the authority runs on (ADR-0014) → C8
- **G6** a link you can hand over  _W:5_
  - **F19** Static build — **How**: Vite build to static assets, no server → build config
- **G7** good to watch  _W:8_
  - **F12** Morph the slot layout through a Formation change — **How**: Figures stay rigid *in* their slots; the slot layout itself interpolates over the transition's real duration, so a line visibly folds into a square → C3, C10
  - **F13** Volley as flash and Powder Smoke — **How**: discrete Volleys already give the battlefield a beat; one flash and one drifting cloud each → C11
  - **F14** Interpolate rendering between sim states — **How**: renderer draws between the last two states; interpolation never touches the sim → C10, C8
  - **F15** Sound every battle event — **How**: one sound per event type, read off the snapshot — `volleys` and `contacts` are already events for the one step they happened in, and a Charge and a Rout are a Unit's state changing between two — so the cut comes free and the enemy's Orders are silent without a rule saying so (§10). Synthesised and not sampled: black powder is filtered noise with a hard attack and an exponential tail, so nothing is downloaded and every sound is a constant somebody can move. A discharge is a dozen cracks scattered across half a second rather than one burst, because six hundred men do not fire together and it is the scattering that makes it a battalion (§10). Under the events, optionally, a band: recorded music streamed from `public/music/`, looped through in turn, pulled down under the fighting and shipped empty. Recorded and not synthesised, which is the split the material argues for — a synthesiser is honest about a discharge and is a noise generator about anything continuous (§10) → C13
- **G8** worth fighting more than once  _W:7_
  - **F21** Advance one battle for two Commanders — **How**: the battle is held and stepped by a server; one seam — a session takes Orders, emits snapshots, reports the Outcome — implemented twice, local in the tab and remote over a socket, neither containing a rule (ADR-0013). The remote half is Bun — its resolver takes `sim/`'s extensionless imports directly and `Bun.serve` carries the socket, so the backend adds no build step and no dependency, and the tests move to the same engine with it (ADR-0014) → C16, C8 _(rejected: host-authoritative, lockstep peers — see T22)_
  - **F22** Send each Commander only what is his — **How**: the snapshot is cut per Commander before it leaves, so what he may not see was never on his machine; the renderer's existing filters become the second line rather than the first → C16, C11
  - **F23** Arrange both armies blind, and start on a barrier — **How**: Deployment sends each Commander his own army only, and ends on both having Stood To or on a 3-minute real-time clock, which is ADR-0006's argument one phase earlier → C16, C17
  - **F24** Survive a Commander going Out of Contact — **How**: the battle outlives the tab, so silence is an army on its Standing Orders and not an ending; a seat is claimed by a token and reclaimed by it, and the Scenario clock is the only timeout → C16, C17, C2 _(rejected: treating a drop as a Break Off — see T23)_
  - _(rejected at the Goal: a tactical AI, and a skirmish generator — both priced and refused in T3. G8 had no Function under it for six milestones because T3's cost was never promoted to a Goal.)_
- **G9** the game teaches its own marks  _W:5_
  - _No Function yet._ The want is named and the material is half-authored — every Scenario already carries a `summary` that is a briefing rather than a history lesson, and `HelpTip` already teaches the buttons whose label is a term rather than a verb. What has no answer is the map: T18 and T21 spent every channel a Unit has and both close with *nothing on screen teaches them*. Any Function here has to clear G2's *"with no labels or menus"*, which is why the likely answer is the Scenario's own voice and not a tooltip layer. **This row is deliberately empty and should stay visible until it isn't.**

## 5. House — Goals × Functions

|  | F1 | F2 | F3 | F4 | F5 | F6 | F7 | F8 | F9 | F10 | F11 | F12 | F13 | F14 | F15 | F16 | F17 | F18 | F19 | F20 | F21 | F22 | F23 | F24 |
| :-- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| **G1** (10) | 9 | 9 | 9 | 3 | 1 | 3 | 3 |  | 1 | 1 |  | 1 | 1 |  | 1 |  |  |  |  | 1 | 3 | 3 | 1 | 1 |
| **G2** (9) |  | 9 | 1 |  | 9 | 9 | 9 | 3 | 3 | 1 |  | 3 | 9 | 3 | 3 |  |  |  |  | 1 |  | 1 |  |  |
| **G3** (9) | 3 |  | 9 | 3 |  |  | 3 | 9 | 9 | 9 | 3 | 1 |  |  |  | 3 | 3 | 9 |  | 3 | 3 | 3 | 3 |  |
| **G4** (8) | 3 |  | 3 | 1 |  | 1 | 3 |  | 3 | 9 | 9 |  |  |  | 3 | 3 |  |  |  | 9 | 3 |  | 3 | 1 |
| **G5** (7) |  |  | 3 |  |  | 1 | 1 | 1 |  |  | 3 |  |  |  |  | 9 | 9 | 3 | 1 | 9 |  |  |  |  |
| **G6** (5) |  |  |  |  |  | 1 |  |  |  |  |  |  |  |  |  | 1 |  |  | 9 |  | 9 |  |  | 9 |
| **G7** (8) | 1 | 3 | 1 | 1 | 3 | 3 | 1 |  | 3 |  |  | 9 | 9 | 9 | 9 |  |  |  |  | 1 |  |  | 1 |  |
| **G8** (7) | 3 | 1 | 3 |  |  |  | 1 | 1 |  | 1 | 3 |  |  |  |  |  |  |  | 3 |  | 9 | 9 | 9 | 9 |
| **G9** (5) |  | 3 | 1 |  | 3 | 1 | 9 |  |  | 1 |  | 3 | 1 | 1 | 3 | 3 |  |  |  |  |  |  |  |  |
| **Σ** | 170 | 217 | 259 | 73 | 130 | 160 | 229 | 122 | 166 | 184 | 141 | 133 | 168 | 104 | 148 | 134 | 90 | 102 | 73 | 189 | 189 | 129 | 132 | 126 |
| **Rank** | 7 | 3 | 1 | 23 | 16 | 10 | 2 | 19 | 9 | 6 | 12 | 14 | 8 | 20 | 11 | 13 | 22 | 21 | 24 | 4 | 5 | 17 | 15 | 18 |

**Top engineering priorities.** Four results are worth arguing with rather than nodding at.

**F3 Initiative ranks first again, and by more.** It was the only function touching five of seven
goals; it now touches seven of nine. It makes delay survivable (G1), it *is* the enemy's tactical
competence (G3), its rule names are the causes in every Dispatch (G2), it is authored as data (G5),
and it is what a **Commander** who has gone **Out of Contact** leaves his army standing on (G8).

**F7 Dispatches-with-cause rose from fourth to second, and that is the most useful thing this
recompute produced.** It moved for one reason: G9 marks it 9, and it is the *only* 9 G9 gives.
Which says something nobody had said out loud — **the Dispatch feed is already the game's teacher,
and it was built for legibility.** "12e Ligne broke: 31% down, enfiladed by the battery on the
ridge" teaches enfilade to a Commander who has never seen it, in the period's own voice, in a
surface that exists. So G9's first Function is very probably not a tutorial at all, and the roof
conflict everyone would expect — a teaching layer against G2's *"no labels or menus"* — may never
need fighting. A Dispatch is neither a label nor a menu. **Do not design the tutorial before
measuring what the feed already teaches.**

**F21 ranks fifth, and the other three multiplayer functions rank 15th, 17th and 18th.** That split
is honest and worth internalising: multiplayer is *one* broadly valuable function and three narrow
ones. But rank measures how widely a function's value spreads across the goals, **not whether it
can be skipped**. F23 blind Deployment ranks 15th and without it a two-Commander battle is a
staring contest in which the man who commits last wins. Necessity and rank are different questions
and this table only answers one of them.

**F8 ranks nineteenth, which still contradicts what was said about it.** Formation Geometry is the
crux, but *not because F8 is important on its own* — F8's value is almost entirely indirect, feeding
F5, F12 and F6 through the component that implements it. The function matrix cannot see that and
the component map in §7 can. Trusting the function ranking alone would send effort to the wrong
place.

## 6. Roof — the conflicts that actually shape the design

The full 24×24 grid is in the [annex](#annex--full-roof-grid). Ten pairs matter.

**F3 Initiative × G1 the commander fantasy** — the most dangerous tension in the design, and it isn't function-versus-function at all. *The better Initiative gets, the less the player matters.* If battalions reliably do the right thing on their own, the honest question is why you're there. The resolution was **Initiative is strictly defensive** — it preserves and never advances — and it is now **Initiative is leashed**: how much a Unit may do unbidden is its Standing Order, and every step it takes on its own account is bounded in metres from its Post, the ground the player last gave it ([ADR-0007](./docs/adr/0007-a-standing-order-sets-a-units-latitude.md)). A Unit drifts a hundred metres off what it was given; it never picks something else. Choosing the ground is the act of *intent*, it is still yours, and it still costs a Courier ride.

**F8 geometry-derived × F10 / F11 hitting the targets** — F8 wants zero hard-coded Formation constants; F10 wants Units breaking at 15–30% casualties and F11 wants battles landing in 20–40 minutes. With everything derived, there are almost no knobs left to hit those numbers with. Resolution: **geometry sets relative effect, a small set of global scalars sets absolute magnitude.** The moment a *per-Formation* constant is needed, F8 has failed and we should know it.

**F1 courier delay × F11 battle length** — a 1500m Order takes ~115 seconds. In a 20-minute battle that is roughly ten order-cycles to your far flank, and fewer once you count thinking time. More delay is more fiction and fewer decisions. Unresolved; both numbers are tuned against Castiglione.

**F13 Powder Smoke × F5 silhouette** — smoke does not blind the *simulation*, but drawn over the field it obscures the silhouettes G2 depends on, and it is thickest exactly where the fighting is. Mitigation: capped opacity, drawn behind Unit bases. *Built, and both halves of the mitigation turned out to mean more than they said.* **Behind the bases** settles the silhouette outright: a Unit is drawn over its own smoke, so only the ground under it is veiled and F5 is not in the argument at all. **Capped** had to become exact — the bank is composited once through one filter, so the thickness is 0.268 whether one battalion is firing or ten, which is what T10's *one accumulator* means taken literally. What was left after that is not legibility but *contrast*, and it is a different Unit than expected: see §8.

**F14 render interpolation × F18 deterministic replay** — not a conflict if the discipline holds, and a nasty one if it doesn't. Interpolated positions must never feed back into the simulation. One accidental read of a rendered position and replays diverge.

**F22 send only what is his × F7 Dispatches with cause** — *the conflict this recompute created,
and it did not exist until G9 was written down.* F7 rose to rank 2 because G9 marks it 9 and marks
nothing else above 3: the Dispatch feed is already the game's teacher, in the period's voice, with
no label and no menu. F22 halves it — and, because the rule was taken for solo too, halves it in all
six existing battles. The half it takes is the interesting one, since what a Commander most wants
explained is what just happened to the enemy in front of him. **Resolved as A:** F7's target now
reads *in the Commander's own army*, and a Dispatch stays what CONTEXT says it is — a line naming
its cause, never a notification, which is what *"12e Ligne broke"* with nothing after it would be.
See T24, and the tension watching it.

**F24 Out of Contact × F3 Initiative** — ◎, and the strongest reinforcement in the grid. F24 is only
possible because F3 already is: an army whose Commander has gone silent is an army on its Standing
Orders, and §9 has *already measured that run* — the four silent nominal battles, an army briefed
above `hold ground` and nobody saying anything all afternoon, same winner, more blood. F24 asks for
no new behaviour at all. It asks for a behaviour that was measured before anyone knew what it was
for.

**F21 two Commanders × F19 static site** — ⊗, and the only frank one. *Static assets, no server* was
a target and is now a target with a condition on it. Resolved by the seam rather than by argument:
one session interface, a local implementation that keeps solo a static site and a remote one that
does not ([ADR-0013](./docs/adr/0013-a-battle-with-two-commanders-lives-on-a-server.md), T22). The
guard is that neither implementation may hold a rule; the day one does, there are two games.

**F21 two Commanders × F18 identical replay** — ×. F18's target is *replay a battle identically from
Scenario and seed*, and a two-Commander battle cannot be, because half its inputs are a person. The
promise narrows to solo unless the Orders are recorded too — which is exactly the shape ADR-0009
named for a resumable address: *a Scenario, a seed and the Orders given*. Not built, not needed yet,
and worth knowing that the two features are the same feature seen twice.

**F23 blind Deployment × F11 battle length** — ×, and caught by putting two numbers side by side
rather than by reasoning. Castiglione's clock is 2400s, which at the default Tempo of 4 is **ten real
minutes**; a five-minute Deployment window made the worst case a third of the session and most of it
one Commander watching a still screen. Neither F11 nor G4 measures it — they are about the Scenario
clock, which is untouched. Resolved by making the number smaller: three minutes.

**F11 Army Break × F20 Arrival** — an army can be one Unit from Army Break with a fresh column ninety seconds off the Field edge. That's a *feature* — it's what Rivoli and Castiglione both turn on — but it means the end condition has to consider what is still on the road, or battles will end one minute before their best moment. *Sharper since ADR-0006, not softer: with Army Break at 1, a single Unit on the road is the whole of what keeps an otherwise empty army in the battle.*

## 7. Components & Function → Component map

| ID  | Component            | Owns                                                                  | ADR |
|-----|----------------------|-----------------------------------------------------------------------|-----|
| C1  | Order Delivery       | Orders, Couriers, the arrival queue, suspend and resume, and the Headquarters they are ridden from | [0002](./docs/adr/0002-orders-are-couriered-from-a-headquarters.md), [0008](./docs/adr/0008-the-headquarters-rides-and-can-be-harried.md) |
| C2  | Initiative Rules     | the ordered rule list, its thresholds by Grade, and the Latitude that gates it | [0004](./docs/adr/0004-initiative-is-an-ordered-rule-list.md), [0007](./docs/adr/0007-a-standing-order-sets-a-units-latitude.md) |
| C3  | Formation Geometry   | slot layouts, Frontage, Footprint, Faces, wheeling, morphing           | [0001](./docs/adr/0001-unit-is-always-a-battalion.md) |
| C4  | Field                | cell grid, Ground, Height, gradient, impassability, Concealment         | — |
| C5  | Routing              | A* over cells, string-pulling, funnelling to Crossings                  | — |
| C6  | Fighting             | Volley, Charge, Contact — every effect derived from C3's geometry       | — |
| C7  | Morale               | Morale, Fatigue, Disorder, Break, Rout, Rally, Morale Ceiling, Army Break | [0010](./docs/adr/0010-fatigue-is-bought-by-the-pace.md), [0011](./docs/adr/0011-morale-comes-back-out-of-the-fight.md), [0012](./docs/adr/0012-disorder-is-what-a-mob-costs-the-troops-it-runs-over.md), [0015](./docs/adr/0015-a-unit-stands-in-ground-of-its-own.md) |
| C8  | Battle Clock         | fixed timestep, Tempo, Arrivals, Plan triggers, end conditions, seed, and the ground a Unit stands in — what a march is held against and what a Charge strikes first | [0003](./docs/adr/0003-typescript-with-a-pure-simulation-core.md), [0015](./docs/adr/0015-a-unit-stands-in-ground-of-its-own.md) |
| C9  | Field Renderer       | terrain drawn from the grid                                            | — |
| C10 | Unit Renderer        | silhouette, base, Figures, the Arm/Grade/Morale channels, render interpolation | — |
| C11 | Effects              | muzzle flash, Powder Smoke, Couriers, Ghosts                           | [0002](./docs/adr/0002-orders-are-couriered-from-a-headquarters.md) |
| C12 | Dispatch Panel       | the feed, fed by named Initiative rules and sim events                  | — |
| C13 | Sound                | one sound per event type                                               | — |
| C14 | Scenario Loader      | height.png, ground.png, scenario.json, Rosters                          | [0005](./docs/adr/0005-terrain-is-authored-as-images.md) |
| C15 | Order Input          | selection, the click-drag grammar, Ghost placement                      | — |
| C16 | Battle Session       | the seam — takes Orders, emits snapshots, reports the Outcome — and its two implementations, local in the tab and remote over a socket; the phase machine including the Deployment barrier and Stand To; authority over which Orders are accepted and what Tempo the clock runs at | [0013](./docs/adr/0013-a-battle-with-two-commanders-lives-on-a-server.md) |
| C17 | Commander's View     | the cut: what one Commander is sent — his own Reports, Ghosts, Couriers and Dispatches, his own army at Deployment, and nothing of the other's. A pure function of a Battle and an Army, so it lives in `sim/` beside the snapshot it narrows | [0013](./docs/adr/0013-a-battle-with-two-commanders-lives-on-a-server.md) |
| C18 | Battle Register      | battles in progress and their addresses; the two seats, the tokens that claim them, joining, Out of Contact, and expiring a battle nobody joined | [0013](./docs/adr/0013-a-battle-with-two-commanders-lives-on-a-server.md) |

Component Σ = Σ(function Σ from §5 × strength), so priorities are carried down rather than asserted.

|  | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | C11 | C12 | C13 | C14 | C15 | C16 | C17 | C18 |
| :-- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| F1 | 9 |  |  |  |  |  |  | 3 |  |  |  |  |  |  | 3 |  |  |  |
| F2 | 9 |  |  |  |  |  |  |  |  |  | 9 |  |  |  | 9 |  |  |  |
| F3 | 3 | 9 |  |  |  |  | 3 |  |  |  |  |  |  |  |  |  |  |  |
| F4 |  |  | 3 | 9 | 9 |  |  |  |  |  |  |  |  |  |  |  |  |  |
| F5 |  |  | 9 | 1 |  |  |  |  | 3 | 9 |  |  |  |  | 1 |  |  |  |
| F6 |  |  | 3 | 3 |  |  |  |  | 9 | 9 |  |  |  |  |  |  |  |  |
| F7 |  | 9 |  |  |  |  | 3 |  |  |  |  | 9 |  |  |  |  |  |  |
| F8 |  |  | 9 | 3 |  | 9 |  |  |  |  |  |  |  |  |  |  |  |  |
| F9 |  | 1 | 3 |  |  | 9 |  | 3 |  |  |  |  |  |  |  |  |  |  |
| F10 |  | 3 | 1 |  |  | 3 | 9 |  |  |  |  |  |  |  |  |  |  |  |
| F11 |  |  |  |  |  |  | 9 | 9 |  |  |  |  |  |  |  |  |  |  |
| F12 |  |  | 9 |  |  |  |  |  |  | 9 | 1 |  |  |  |  |  |  |  |
| F13 |  |  |  |  |  | 3 |  |  |  |  | 9 |  |  |  |  |  |  |  |
| F14 |  |  |  |  |  |  |  | 9 |  | 9 |  |  |  |  |  |  |  |  |
| F15 |  |  |  |  |  |  |  |  |  |  |  |  | 9 |  |  |  |  |  |
| F16 |  |  |  |  |  |  |  |  |  |  |  |  |  | 9 |  |  |  |  |
| F17 |  |  |  | 3 |  |  |  |  |  |  |  |  |  | 9 |  |  |  |  |
| F18 |  |  |  |  |  |  |  | 9 |  |  |  |  |  | 3 |  |  |  |  |
| F19 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 3 |  |  |
| F20 | 1 |  |  |  | 3 |  |  | 9 |  |  |  |  |  | 3 |  |  |  |  |
| F21 |  |  |  |  |  |  |  | 3 |  |  |  |  |  |  |  | 9 |  | 1 |
| F22 |  |  |  |  |  |  |  |  |  |  | 1 |  |  |  |  | 3 | 9 |  |
| F23 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 3 | 9 | 1 |
| F24 |  | 3 |  |  |  |  |  |  |  |  |  |  |  |  |  | 3 |  | 9 |
| **Σ** | 4449 | 5488 | 4846 | 1903 | 1224 | 3648 | 4389 | 6399 | 1830 | 4743 | 3727 | 2061 | 1332 | 2889 | 2593 | 3081 | 2349 | 1455 |
| **Rank** | 5 | 2 | 3 | 14 | 18 | 8 | 6 | 1 | 15 | 4 | 7 | 13 | 17 | 10 | 11 | 9 | 12 | 16 |

**Where the engineering effort goes.**

**C8 Battle Clock ranks first again.** It sounds like plumbing. It is in fact the only component
touching four of the highest-leverage things in the design at once: it schedules Arrivals (F20), it
owns the fixed timestep that makes replay possible (F18) and the interpolation that makes the game
watchable (F14), and it holds the end conditions (F11). Nothing in any session suggested building
it first — the ranking did.

**C2 Initiative Rules rose from fourth to second, and F24 is a real part of why.** F3 and F7 both
climbed above it, and then **Out of Contact** was added — a Commander who drops leaves his army
standing on C2 and nothing else. The component that lets an army fight when nobody is commanding it
is now the second most valuable thing in the design, which is a strange sentence for a game about
being a commander and is exactly what ADR-0007's leash is holding at bay.

**C3 Formation Geometry ranks third, still vindicating the claim F8 alone couldn't support.** Its
value aggregates across F5, F8 and F12 — silhouette, geometry-derived combat and the morph are the
same slot layouts read three ways. Build it first anyway, C8 notwithstanding, because C6 and C10 are
both meaningless without it.

**C16 Battle Session ranks ninth, which is the multiplayer work priced honestly.** It is not a
headline component. It carries one important function and three narrow ones, and the three narrow
ones are cheap because C17 is a pure function and C18 is a map with an expiry sweep.

**C18 Battle Register ranks sixteenth, which settles the question of whether to fold it into C16.**
Folded, the pair would score 4536 and rank fifth — four places above where the session actually
belongs, with "which browser holds the French seat" inflating the rank of "what Tempo the clock runs
at". Keeping it separate is what makes C16's ninth place true.

**C5 Routing now ranks last of eighteen**, which is worth internalising: pathfinding is the classic
thing to sink three weeks into, and by this ranking it earns less attention than the sound effects.
String-pull an A* and move on.

**The ranking disagrees with the natural build order in one place.** C14 Scenario Loader ranks
tenth, but nothing can be tested against Castiglione or Rivoli until it exists. Ranking measures
value, not sequencing.

### What the map says about a Unit (C10)

G2 asks that silhouette and colour say what everything is doing. Silhouette is spent on Formation
(F5) and colour on the army, which leaves three things a player needs and could not get without
selecting a Unit: what Arm it is, what Grade it is, and how it is holding up. Each gets one channel
and may not touch another's.

The whole Field is on one screen (T8), so the channels are chosen against the hardest scale rather
than a comfortable one: at 0.7px/m a battalion in line is 102px by **2.6px**. There is no inside to
draw in, and hue is unavailable to all three — it says which army, and one of the two armies is
white (`#e3e7ef`), which also rules out saying anything by paling a Unit out.

| Read | Channel | Drawn as | Why this one |
|------|---------|----------|--------------|
| **Arm** | texture along the length | infantry one solid block; cavalry four squadron blocks with 3px intervals; a battery its guns standing apart and no block at all | the length is the only axis with pixels to spend |
| **Grade** | keyline weight and alpha, in dark ink | elite cut out of the grass with a hard edge, conscript bleeding into it | dark ink is the one thing that reads on a white army and a blue one; pattern closes up at this depth (§10) |
| **Morale** | the dressed edge's colour, and the Face line breaking | white → `#d8632f`, the orange a mob is already drawn in | the dressing goes all the way round, so a Unit in march column with no Face still says how it is holding up |

Morale's colour is deliberately the mob's own: the Rout stops being a shape changing without warning
and becomes the end of something the player watched happen. On a white army the ladder runs the
other way round and still reads — nothing at steady, orange at breaking.

The squadron intervals are cosmetic and have to stay that way. Frontage is C3's, and widening it to
make room for them would be the renderer deciding how much ground a regiment covers; C10 squeezes
the Figures into the intervals instead.

Selection, Formation, Strength, army and Routing already hold the gold ring, the silhouette, the
Figure count, hue and the mob's disc. Between them and the three above, every channel a Unit has is
now spoken for — which is the cost recorded as T18.

## 8. Critical performance budget

| Rank | Function | Target | Watched on | If we miss it |
|------|----------|--------|-----------|----------------|
| 1 | F1 courier delay | 200m ≈ 15s, 1500m ≈ 115s | the bridge-march fixture | Cap the ride, or flatten toward a constant. **If delay still isn't fun after tuning, the central bet has failed and everything downstream reopens.** This is the one to test first and the reason milestone 1 has no combat in it. |
| 2 | F3 Initiative | never idle under threat; every act explainable by the rule that fired | both fixtures, then Castiglione | Shorten the list and promote the missing behaviour to an explicit Order. If the list passes ~20 rules or becomes order-fragile, revisit T14. |
| 3 | F20 Arrival | by clock time or trigger, at a point or edge | Rivoli | Hand-place arriving Units at Deployment. Rivoli and Castiglione both become un-authorable; the campaign shrinks to Lodi and Arcole. |
| 4 | F10 Morale | Break at 15–30% casualties; 0 Strength is a bug | Castiglione | Add global Morale scalars. If per-Formation constants are needed, F8 has failed — record it. |
| 5 | F11 battle length | 20–40 min at Tempo 1 | Castiglione | Raise default Tempo, then shorten the Scenario clock. Both are data. |
| 6 | F6 Field on one screen | ≤1920m, 60fps | Rivoli — the largest Field in the campaign | Add zoom and pan, and accept that G2's silhouette guarantee weakens with it (T8). |
| 7 | F21 two Commanders | one authority, one clock; round trip under one 100ms step | a two-Commander Castiglione, both browsers on one machine and then on two | An Order applies on the step it arrives — a Courier ride is 15–115s, so a late round trip is beneath the mechanic's own resolution. The failure that matters is the process not staying up, and the fallback is that multiplayer is unavailable while solo is untouched. That is precisely what the seam was bought for. |
| 8 | F22 the cut | zero enemy Reports, Ghosts, Couriers or Dispatches on the wire | a headless test over `load-headless.ts`, asserting the cut against a built Battle | There is no partial credit and nothing to tune: a leak is not a slowdown. If the cut is wrong, blind Deployment and the Report rule are both simply gone. This is the one row whose fallback is *fix it*. |
| 9 | F23 Deployment window | both Stood To, or 3 minutes | Rivoli — 13 Units, the largest army anyone has to arrange | Raise to four minutes. If four still binds, the arranging grammar is what is slow and the clock is not the thing to change. |
| 10 | F24 Out of Contact | the clock never pauses; the seat is recoverable at the same address | pulling the plug mid-Castiglione and rejoining from the same browser | A drop becomes a Break Off — T23's rejected option, honest as a fallback because it is at least a rule the glossary already holds. |
| 7 | F5 silhouette | 4 infantry silhouettes distinct at 1 px/m; Figure ≥ 3px | Rivoli | Add an army-coloured base outline, then a Formation glyph. *Both rungs are now spent and neither went where this row expected. The base outline's edges carry the Arm, Grade and Morale channels (§7), and the glyph carries **Disorder** ([ADR-0012](./docs/adr/0012-disorder-is-what-a-mob-costs-the-troops-it-runs-over.md)) — spent on the one read a Unit has that no silhouette could ever give, rather than on labelling the Formation the silhouette already names. So the ladder is gone and the fallback for a silhouette that does not read is a new one.* |
| 8 | F4 routing | under 10ms on 250×250 | Rivoli — gorges are the worst case | Precompute a flow field per Crossing. Cheap, and it makes funnelling exact. |
| 9 | F14 interpolation | zero judder at 10Hz sim / 60fps render | any scenario | Raise the sim to 20Hz. Costs determinism nothing; costs CPU almost nothing at 40 bodies. |
| 10 | F17 Field authoring | a Field in under an hour | Rivoli — hand-painting 200m of relief | Build the tile editor after all, reinstating the cost ADR-0003 flagged. |

### Measured so far

On the fixtures, where a rule is watched in isolation:

| Rank | Target | Measured | Where |
|------|--------|----------|-------|
| 1 | F1 courier delay: 200m ≈ 15s, 1500m ≈ 115s | 15.0s and 115.0s | `src/sim/sim.test.ts` |
| 8 | F4 routing under 10ms on 250×250 | 1.9ms, worst case corner to corner past one bridge | `src/sim/routing.perf.test.ts` |
| 4 | F10 Morale: Break at 15–30% casualties | 16.4% conscript, 22.2% line, 25.9% elite | `src/sim/sim.test.ts` |
| 2 | F9 Contact decided in ≤30s | one step, 0.1s | `src/sim/sim.test.ts` |
| 5 | F11 battle length: 20–40 min at Tempo 1 | the fixture's 30-minute clock runs out; neither army got past half of itself running | the bridge-march fixture, headless, with no Orders |
| — | C7 Disorder: three causes, three costs, one way out | a Pursuit disorders the pursuer and holds him there until he stands; a mob run over a formed Unit disorders it; two formed Units walked through each other disorder both; the drill is C3's and Grade reaches it | `src/sim/disorder.test.ts`, `src/sim/sim.test.ts` |
| — | F13 one flash and one drifting cloud per Volley | one cloud, born at the muzzles, capped at 0.268 however many fire | the plate, `/plate`, with the toggle |
| — | F15 a distinct sound per Volley, gun, Charge, Contact, Rout and Order arrival | all six heard in one commanded Castiglione; every Volley heard exactly once against 6 frames a step, every Rout once against the steps it spends running, and Orders from one army only | `src/sound/listen.test.ts` |
| — | F15 a discharge rolls rather than cracks | 5–16 cracks over 0.3–0.6s for a battalion, 2–6 over 0.55s for a battery, thinned and smeared with distance; 56 voices a step is the ceiling | `src/sound/index.ts`, and by ear |
| — | F15 a crack is shorter than the gap between cracks | peak overlap 2 for a battalion, 1 for a battery, 3 for Contact — against 5, 2 and 5 before | `src/sound/index.ts` |
| — | F15 the band loops through its tracks | one handover per track, crossfaded over 5s; ducks to 0.83–1.0 under an artillery duel; nothing started once it is switched off, and the switch reads *no tracks are installed* when the manifest is empty | two tracks in `public/music/`, in Chromium |

And on the two nominal battles, which is where the rows above say to watch them. `pnpm measure`
steps Castiglione and Rivoli to the clock with the player silent — each army taken in turn, so each
authored Plan is watched once against an army doing nothing, and every Unit stands at the rung its
Roster gave it. Take them again rather than trusting this table, which is what it is for.

| Rank | Target | Castiglione | Rivoli |
|------|--------|-------------|--------|
| 5 | F11 20–40 min | 40:00, by Key Ground both ways | 40:00, by condition taken French and by Key Ground taken Austrian |
| 5 | F11 dead clock | 0:10 and 0:08 | 0:23 and 0:14 |
| 3 | F20 Arrival on its clock | 1 Arrival, 0.0s late | **8 Arrivals, none more than 0.1s late** |
| 3 | F20 arrives somewhere it can leave | 16m walked in its first minute | 80–246m walked in the first minute |
| 4 | F10 Break at 15–30% | **15.7–30.4%**, medians 17.1% and 20.4% | **15.6–33.9%**, medians 20.7% and 20.8% |
| 4 | F10 Breaks outside the band | 2 of 11, and each says why | 1 of 25, and it says why |
| 4 | F10 0 Strength is a bug | lowest 67 men | lowest 56 men |
| 8 | F4 routing under 10ms | — | 0.15–0.65ms through the gorge; **4.0ms corner to corner** |
| 2 | F3 rule list under ~20 | 11 rules; 4 and 8 fire | 11 rules; 8 and 7 fire |
| 2 | F3 the Latitude leash, in metres from the Post | close-up 100m; stand-off 250m; follow-up 300m | close-up 100m; stand-off 250m; follow-up 300m |
| — | C7 Disorder, spells and Unit-seconds | 16 spells / 1328s and 16 / 2370s | 26 / 2509s and 57 / 4344s |
| — | C7 Disorder, walked through by a formed Unit | 14 of 16 and 12 of 16 | 18 of 26 and 50 of 57 |
| — | C7 Disorder bought by a Pursuit | **none, on any run** | **none, on any run** |
| — | C7 Disorder, longest single spell | 181s and 472s | 477s and 479s |
| — | F18 identical replay | digest identical on a second run | digest identical on a second run |
| — | §9 order-cycles to the far flank | 52–55 against a floor of 3 | 36–63 against a floor of 3 |

And on a two-Commander Castiglione, which is where rows 7 to 10 said to watch them. Two browsers on
one machine, the server in a third process, `/ws` proxied by Vite.

| Rank | Target | Measured | Where |
|------|--------|----------|-------|
| 7 | F21 round trip under one 100ms step | **median 1.9ms, p90 3.5ms, worst 4.5ms** over 30 Orders | one machine, loopback |
| 7 | F21 one authority, one clock | both Commanders' clocks read the same second; Tempo is the slower of the two asked for | `server/register.test.ts` |
| 7 | F21 an Order only from the Commander whose Army it names | the other army's Units are not in the snapshot to name, and the seat's army is read back out of the register | `server/main.ts`, `register.test.ts` |
| 8 | F22 the cut, zero enemy Reports on the wire | 10 assertions on a five-minute headless Castiglione with both Plans firing | `src/sim/cut.test.ts` |
| 9 | F23 both armies arranged blind | each Commander is sent 11 Units and one Headquarters; 22 and two the step the clock runs | `register.test.ts`, and by eye |
| 9 | F23 Deployment ends on both, or on 3 minutes | both: at once; clock: on the wall clock, started when the *second* army was taken | `register.test.ts` |
| 10 | F24 the clock never pauses | plug pulled at 0:15, rejoined at the same address at 0:52, same seat and same army, afternoon carried on | two browsers, one machine |

**F21's round trip is three orders of magnitude inside its budget, and that was the easy half.** A
Courier rides at 13 m/s and F1's floor is 200m ≈ 15s; two milliseconds is 0.013% of that. The row
was always going to pass on one machine and the number worth having is from two, which is not
measured here and is the honest gap in this table. What the loopback figure does establish is that
nothing in the *authority* is slow: the server takes an Order, steps nothing, cuts a snapshot for 22
Units and answers, and that whole path is under five milliseconds at the worst of thirty tries.

**What the wire costs was estimated at 15KB a state and measured at 9.46.** Sixty seconds of a
running Castiglione, counted on a Commander's own socket across a real connection: 600 states in
60.0s, **9.46KB each**, **94.6KB/s** to one Commander and about 189KB/s out of the server. The tick
is exactly the 10.0/s it was built to be.

The estimate was not wrong about the object it measured — it measured the wrong object. 15KB is a
`BattleSnapshot`; the wire carries a `State`, which is that snapshot minus two things this milestone
put there and then did not re-measure. The other army's Units arrive with their Report null, so his
cost 346 bytes against my 483 — 137 bytes eleven times, some 13% of every message. And the feed goes
as a tail rather than as a feed: `dispatches` is **170 bytes** on the wire where a snapshot in memory
holds every Dispatch the afternoon has produced. That second one is the larger half, and it is why
the cost does not climb as a battle goes on.

Taken apart, one message is 9,844 bytes of which `units` is 92.6% — 22 Units at 414 bytes each — and
**field names are 5,469 bytes, 55.6% of the whole**. That is the 2% from rounding coordinates
explained rather than asserted: the names are the payload and the float digits are the rounding
error. A real reduction is a shorter encoding or a per-Unit delta, and both are a change to make
deliberately.

**Trigger: tested, and it did not fire.** A Castiglione was fought between two Commanders across a
real connection — 16ms of network against a tick that quantises to 100ms — and the Field did not
stutter. What the number now bounds is the bill rather than the feel: message rate is wall-clock and
not Scenario clock, so a forty-minute Castiglione costs about **57MB a Commander at Tempo 4** and
four times that at Tempo 1. Fine on a desk and not fine on a phone, which is a different trigger than
the one written here and is not yet anybody's Goal.

**F23's clock is measured and F23's question is not.** That both Commanders are sent only their own
army, and that the arranging ends on both having Stood To or on the three minutes, are assertions
that pass. Whether a person can arrange Rivoli's thirteen Units inside three minutes is a fact about
a person, and nobody has been timed doing it. That is the row to take to a second player first.

**The engine moved and the battles did not.** [ADR-0014](./docs/adr/0014-one-javascript-engine-for-the-simulation.md)
took `pnpm test` and `pnpm measure` to Bun so that the tests run on whatever engine the authority
runs on, and asked for the budget to be re-taken rather than assumed to carry over. Taken both ways
on the same commit, the four nominal runs agree on every simulation number the report prints: the
same Breaks at the same second, the same casualty shares, the same lowest Strength to seventeen
digits, the same Disorder spells and Unit-seconds, the same drift in metres, the
same order-cycles. **The only lines that moved are wall clock.** The routing probes are 10–35%
quicker on JavaScriptCore — 4.39ms to 4.00ms corner to corner, 0.99ms to 0.65ms down the gorge — and
the whole measure run takes 9.8s against 19.2s. The table above now carries Bun's numbers, and the
two it changed are both stopwatches.

So `sin`, `cos`, `hypot` and `atan2` agree between V8 and JavaScriptCore at this simulation's depth,
and ADR-0014's concern is theoretical rather than measured — which is exactly what its own
Consequence said to write down if nothing moved. The rule stands anyway, and for a reason the
measurement does not weaken: what was checked is four battles on two engines on one machine, not
those four functions in general, and the cost of keeping the authority and the baseline on one
engine is one line of `package.json`. What the result does buy is that a battle reported from a
browser is very unlikely to be irreproducible on the server, which was the failure ADR-0014 was
most worried about.

Rank 1's real question — whether the delay is *fun* — was answered by playing the fixture, and
it is. The central bet holds: an Order that takes a minute and a half to arrive is a game. Nothing
downstream reopens, so the cascade stands as scored.

C6 and C7 together settle what a firefight is. Two lines standing eighty metres apart take about
9% off each other in the first minute, and one of them Breaks between two and a half and four
minutes in. Morale is what ends a fight; fire only decides how quickly it gets there. Nothing
reaches 0 Strength any more, which is what F10 asked for.

C6's other half settles what a Charge is worth, and the numbers are the argument for building
square out of Frontage rather than out of a rule. Four hundred horse into a seven-hundred-man
battalion, frontally, at full Morale:

| It was standing in | Front that met | It lost | Morale it cost | Carried at Morale |
|---|---|---|---|---|
| line | 140m | 56 men, 8% | 0.45 | 0.44 |
| attack column | 47m | 19 men, 2.7% | 0.15 | — |
| square | 36m | 14 men, 2.1% | 0.12 | 0.11 |
| march column | 2.8m | 1 man | it broke | always |

A square is four times harder to break than a line and it is entirely because it is a quarter as
wide, so a quarter as many sabres reach it. Nothing in C6 knows what a square is. And the last row
is the one that matters most: a battalion caught in march column costs the horse nothing at all and
comes apart for one casualty.

**Letting go too close beats the drill, and only just.** A Charge let go at 290m strikes after 71
seconds and at 200m after 37, and the square lands both times — the drill is 30. Let go at 140m it
strikes after 18 and catches the battalion mid-drill with no Face at all. So the window is roughly
150–200m, which is narrower than the rule was designed against and is exactly the ground the player
has to buy with a Move Order first.

**The fixture with no Orders at all does not resolve, which is the best answer §9's first trigger
could have returned.** Run headless for the full thirty minutes with the player silent, the
Austrian Plan breaks two French-facing battalions eight minutes apart and both Rally; neither army
gets anywhere near having nothing left in hand; and nothing ever crosses the river. The battle ends
undecided with the bridge held by nobody. Taking the ground was entirely the player's — though
every Unit on that run stood at `hold ground`, which was the only rung there was, and the run is
worth repeating against an army briefed to follow up.

**Nobody came within the bridge's radius on that run — the nearest formed Unit stopped 111m off a
90m radius.** The Austrian Plan parks its covering battalion short of the crossing, which is what
a battalion covering a bridge does: it was covering the hamlet on the far bank, which is the
ground that commands the crossing and the ground nothing was scoring. A Key Ground that can only
be taken and never defended is only half a decision, and while the clock branch was rare that was
a footnote. ADR-0006 made the clock the ending, so it stopped being one.

Resolved as data, not as a rule. The fixture now carries two pieces: **the bridge** at (744, 596)
with a 34m radius, which means being on the deck, and **the hamlet** at (828, 592) with a 48m
radius, which is the painted village at cells 99–107 × 70–77. The Plan's first order already sends
`au-ir23-2` to (850, 590) — 22m from the hamlet's centre and inside it — so the Austrians defend
the new piece without a line of the Plan changing. The two radii sum to 82 against 84m between
centres, so no Unit can stand on both.

Two pieces rather than one is the part that is about F11 and not about this Field. With the clock
deciding nearly every battle, a single piece makes every result binary; two allow a 1–1 that falls
through to condition and a 2–0 that reads as a day's work. **The question two pieces raise:**
whether the French can cross a one-column bridge and clear a garrisoned hamlet inside thirty
minutes at all. If they cannot, every battle ends 1–1 and the hamlet is scenery.

**The French can be over the bridge and into the hamlet inside the clock, which is what the second
Key Ground was waiting on.** Now that the fixture carries a Plan for each army, the question runs
headless from the other end: take the Austrian, leave it silent, and the French Plan puts the guns
in battery at 3:26, the leading battalion across and in line on the far bank at 8:53, the hamlet's
garrison broken at 9:30 and off the Field at 14:36. At the clock the French hold both pieces, and
it cost them two of their five battalions routed. So the hamlet is not scenery, and an Austrian who
does nothing loses 2–0 — which is the whole of what the far bank needed before it was worth
playing.

**The order-cycle trigger is measured and is nowhere near tripping.** From the ground each
Headquarters is deployed on, the farthest Unit of its own army is 496–870m off, which is a ride of
38–67 seconds against a 2400-second clock: between 36 and 63 cycles to the far flank where §9's
trigger fires below about three. The trigger was written against a 20-minute battle and both
nominal clocks are 40, so it has twice the room the tension was phrased for. It can be struck when
a Field is authored that is wider than these two, and not before.

The Austrian end of the bridge fixture is still unmeasured. The French Plan is authored intent and
cannot read a defence, so what a defended crossing costs it is a thing to watch rather than a thing
measured.

### What the nominal battles say

**Both battles run the full clock, and almost none of it is dead.** Every one of the four runs
reaches 40:00 — Castiglione decided on Key Ground both ways, Rivoli splitting its two pieces one
apiece and falling through to condition. The last Volley or Contact lands between 0:00 and 0:14
before the end. So T19's stated cost — *a decided battle can leave twenty minutes of dead clock* —
does not materialise on either Field. It was the strongest argument against ADR-0006 and it is not
one the nominal battles support.

**Rivoli splitting 1–1 and falling to condition is the two-piece design working.** It is the case
the second piece of Key Ground was added for: a single piece makes every result binary, and here
the French hold Rivoli, the Austrians hold the chapel, and what each army has left decides the
day — nobody when the French are taken and silent, the Austrians when they are not.

**Both battles now meet F10 but for one Break apiece, and the two that miss say why they missed.**
Medians across the four runs are 19.4%, 22.8%, 20.7% and 21.3%, against the 16.4–25.9% the fixture
gives and the 15–30% the band asks for. It took two findings to get there, and neither was the
cause rank 4 expected. **The tail was never a Morale scalar.** Rivoli's 89.7% was one musket
Volley: the depth compounding treated every rank as an independent chance to find a man, so a
hundred-and-forty-deep march column left a ball no way of missing and a battalion killed a man with
ninety-eight of every hundred it fired. Split into the share of a discharge that goes where anybody
is standing and the compounding over what stands in that lane, deep targets fall to 0.32–0.40 men a
musket. **The larger cause was that Morale came back while men were being shot at.** Recovery ran
every step against anything, so a Unit in a ten-minute firefight was handed a whole Morale back over
the course of it and Broke tens of points late — the Units that met the band had regained 0.11–0.20
during the fight that broke them, the ones at 42% had regained 1.42 and 1.65
([ADR-0011](./docs/adr/0011-morale-comes-back-out-of-the-fight.md)). A *per-Formation* constant was
never reached for and F8 stands.

**Depth was priced twice over before a musket stopped searching, and that was the last of the
tail.** The compounding recovers a ball that missed the front rank, and there is only one way a ball
misses that the ranks behind can put right — it went between two men rather than over them.
Elevation is not recoverable at any depth, because the sixty-eighth rank stands at the same height
on the same ground as the first. So the compounding runs over ten ranks for a musket and without
bound for a gun, which does not stop in the man it hits: `SEARCHED`, per Arm and never per Formation,
so F8 stands. It is the one number here fitted rather than derived — the physics says a handful of
ranks and not which handful — and the range it may take is narrow at both ends. Below about six the
attack column stops being a fat enough target for §6's line-against-column exchange to hold; above
about thirteen the tail comes back. The Dragoner falls from 57.4% to 30.2% and the 1er Hussards from
43.6% to 30.4%, and the single Volleys that decided them from 54% and 36% of the Unit to 24% and 23%.

**The seven Breaks outside the band are three shapes, and each says which on the line that reports
it.** Two are a small mounted Unit taking a whole battalion's Volley — the 1er Hussards for 23% of
itself and the Dragoner for 34%, at a stroke, with nothing at all regained. That is not a Morale
rule deciding anything and it is not a fault in the fire either: a two-hundred-and-eighty-man
regiment in two ranks is as wide as a battalion in line, so it draws the whole Volley with a third
of the men to absorb it. The geometry is right and the arithmetic follows it. Two are the opposite
case — the 1er/5e and the 14e Légère, both broken past the half-hour
under fire so sporadic that the worst Volley either saw took 4% of it, both having steadied in the
gaps. That is [ADR-0011](./docs/adr/0011-morale-comes-back-out-of-the-fight.md) working rather than
failing: a battalion shot at once every two minutes is mostly out of the fight and ought to mend.
What it costs is a Unit that fought all afternoon sitting a few points over the band.

**The third shape appeared with the briefed Rosters, and it is the flank rule doing its job.** The
other two miss high; this one misses low, and it is now three of the seven. The 2e/75e Broke at 9.3%
of itself, the 32e at 13.7% and the Kavalleriebatterie at 14.9%, all with no Fatigue on them, no
lowered Ceiling under them, and every Morale point they lost coming on a step that cost them men —
so neither shock nor mending explains any of them. What does is *where the fire came from*: weighted
by the men it killed, the 2e/75e was shot 1.52 off its Face, the 32e 1.78 and the battery 0.77, on
the `1 - cos` scale `flanking` prices shock on, where 1 is square on the flank and 2 is from behind. Fire from the flank is meant to cost more nerve than the men in it —
`flanking` exists because Units broke from being flanked long before the casualties justified it —
so a battalion shot in the flank all afternoon Breaks below a band that counts casualties, and
should. **It is a shape the design could not have seen before now:** a flank is something somebody
has to manoeuvre to find, and until Rosters carried a rung nobody manoeuvred. Every Unit stood
where its Plan posted it, facing where it was pointed.

Disorder added no fourth shape. It moved two Breaks a few points and added two more to Rivoli taken
Austrian, and every one of them landed in one of the three above — which is the answer wanted from a
rule that costs a Unit its ranks and never its nerve.

The three are not interchangeable and the budget run does not treat them as one. Most of the Breaks
*inside* the band were also flanked past the same bound, so read as a blanket excuse the flank
clause would forgive nearly anything. It is asserted against the direction of the
miss instead: a big Volley and a Unit that steadied explain a Break that came late, and being shot
off the Face explains one that came early, and only that.

**Two of the eleven Initiative rules never fire in any of the four runs**, down from five. Firing
everywhere: broke and running, deployed with the enemy too close to stay on the march, took march
column to cover the ground, closed up to bring them under its fire. Firing on three runs of the
four: limbered up, rallied, followed up as they gave way, gave ground rather than be closed with.
Firing once, on Rivoli taken Austrian, for eighteen seconds: squeezed into march column for the
Crossing. Silent everywhere: formed square, countercharged.

Those last two are the mechanic §0 already says the campaign under-exercises and tests against
purpose-built fixtures instead, so that is the design working as written and not a gap. **The
Crossing rule is silent for a reason that is also not a gap:** every Unit that goes up the Adige
road is authored into the travelling Formation before it sets foot on the Field — IR 10 Jordis and
the Dragoner in march column, the Kavalleriebatterie limbered, and Lusignan's two the same — so the
rule's first guard finds the Unit already in the Formation it would have called for. Not shadowed:
the rule fires on the bridge fixture, once, with the enemy inside ENGAGEMENT_RANGE, which is the
case it was written for (`crossing.test.ts`). A silent rule here means the Scenario never posed the
question, not that the list cannot answer it.

**The Latitude leash is measured, and it is spent exactly to the metre.** The three rules that let
a Unit take ground on its own account — gave ground, closed up, followed up — were all silent for
as long as the rung could only be set from the player's own panel: every Unit was built at
`defaultStanding()`, no Roster carried a brief, and the measured Shift from the Post was not a
hundred metres or five hundred but *never*. A Roster entry now carries `standing`, which is
ADR-0007's *free at Deployment* spent by the author instead of by the player, and the bound stops
being a thing taken on trust. Across the four runs the farthest ground any Unit took on its own
account is 100m at `close-up`, 250m at `stand-off` and 300m at `follow-up` — each rung's leash,
reached and never passed. The bound was accepted rather than measured (§9); it is now both.

**What a brief costs is the part the runs argue about.** Briefing an army above `hold ground` does
not win it the battle: the winner is unchanged in all four runs and Castiglione is barely moved,
because its defending Austrians mostly hold. What changes is the bill. Rivoli's Austrians, briefed
to close up and follow up as they come off Monte Baldo and up the gorge, go from 27.6% gone to
58.6% — an attacking army that walks the last hundred metres into a defended plateau on its own
account pays for the ground it takes. The French holding that plateau go the other way, from 21.3%
gone to nothing at all. This is the ladder having a price, and the price falls on whoever is
attacking.

**Rank 2's other half moves for the first time.** *Never idle under threat* is measured as its
failure — Unit-seconds spent under fire with no answer — and briefing the Rosters takes the four
runs from 20,421 such seconds to 15,297, a quarter of them gone, with Rivoli taken French nearly
halved (7,496 to 3,912). The target still cannot pass or fail as written, for the reason given
below: a Unit at `hold-ground` standing under fire it cannot answer is obeying its brief. But the
number now moves when the brief moves, which is the first evidence that it measures the brief and
not the rule list.

**Disorder fires on all four runs and never once as a Pursuit, which is the design saying so
rather than the rule failing.** Between sixteen spells a run and fifty-seven, thirteen hundred to
forty-three hundred Unit-seconds. Not one is a pursuer, because the silent runs cannot reach one: a
Plan has never issued a Charge, no rung of the Latitude ladder buys an advance after a beaten enemy,
and a Pursuit is what a Charge becomes. So the half of C7's newest rule that the whole thing was
built for is exercised on the fixture and nowhere else, which is the same answer §0 already gives
for square and the countercharge — the campaign under-exercises it, and the fixture is where it is
watched.

**Three quarters to nine tenths of it is now one formed Unit walking through another**, which is
[ADR-0015](./docs/adr/0015-a-unit-stands-in-ground-of-its-own.md) arriving: before it, a battalion
could be marched clean through the battalion beside it at no cost at all, and the spell count on
these runs was between one and fifteen. It is the mob rule read without the Rout in it, and the runs
say what the design suspected — armies that never leave intervals walk through themselves
constantly. The longest single spell is 479s, inside a drill and a half, which is the check that
what is being charged is the passage and not the standing: two Units that come to rest in each other
sort their ranks out where they stand.

**What it cost is one afternoon out of four, and the cost fell on the attacker again.** Castiglione
does not move at all beyond a single Break landing 1.7 points later; Rivoli taken French does not
move by a digit. Rivoli taken Austrian is the run that pays: the French go from 66.0% gone to 74.5%
and the Austrians from 6.9% to 24.1%, with the same winner on the same ending. Both armies bleed
more and neither wins differently, which is the shape a rule ought to have that costs troops their
shape and never their nerve.

**Powder Smoke costs one Unit in the campaign, and it is not the one the roof was worried about.**
F13 × F5 was written as a legibility problem — smoke drawn over the silhouettes G2 depends on — and
drawing it behind the Unit bases retires that half completely: a Unit is painted over its own smoke,
so what a bank veils is the ground and never the shape standing on it. What is left is *contrast*,
and measuring it turns the tension inside out. A Unit is found by its body **or** by its keyline,
whichever the eye catches first, and the keyline is dark ink — so a pale veil sharpens the keyline by
as much as it flattens the body. Worst case over every paper tone on offer, an elite battalion goes
from 4.71 against the ground to 6.05 under a full bank and a line battalion from 3.13 to 3.66. Smoke
makes almost every Unit on the Field *easier* to see.

The exception is exact and it is a Grade channel working as designed. A conscript's keyline is
alpha 0.3 — the faint edge *is* how Grade is drawn (§7) — so a conscript has nothing but its body to
be found by, and in the white army that body is `#e3e7ef` against a whitening ground: 2.27 bare,
1.84 under the cap. **Every one of the six authored Rosters was checked and there is exactly one
such battalion**, in Castiglione's Austrians. Recorded rather than fixed, because the fix is a
conscript keyline that stops saying conscript.

**The colour was decided by the measure and not by the period.** Real powder white (`#f2f2f0`) puts
that battalion at 1.72 — under the 1.88 `settings.ts` keeps on file as the paper tone to argue
against — so the smoke is `#dcdcd6`, which is as white as the white army can afford. The cost is
0.10 of the bank's own visibility against open ground, 1.27 rather than 1.37, and smoke is the one
mark on this map that also reads by moving.

**The bank was looked at on the plate, and it reads.** Which is the only way this one could have
been closed: every number above bounds what smoke may do to the ground, and none of them says
whether a drifting cloud at 0.268 over the grass is a battlefield or a smudge. Six sources on the
period's reload clocks, the toggle thrown both ways over the same ground, and the drift carried
across the Arm-by-Grade-by-Morale band. F13 is built.

**Smoke had to be aged on battle time, and that is a Tempo bug caught before it was written.** A
Flash and a Clash burn down on the wall clock, which is right for sub-second marks. Tempo defaults
to **4**, so a bank on the wall clock would be four times as thick at the Tempo the game is played at
as at the Tempo every number above is measured at — and thickness is the whole of the roof's warning.
On battle time a bank is the same bank at any Tempo, and it stops when the battle is paused.

**The rule was too eager once, and the measure is what said so.** Written as the two shapes merely
touching, it fired on a mob streaming twenty metres in front of a line without a man of it coming
through, and it flipped Rivoli taken Austrian outright. Asked instead as the two being *in among
each other*, three runs of the four come back with the numbers they had. A rule that changes every
battle it is added to is not a rule about mobs running over troops; it is a tax on standing behind a
fight.

**Two of this section's own targets cannot be checked as written.** Rank 2's *never idle under
threat* predates ADR-0007: at `hold-ground` a Unit standing under fire it cannot answer is obeying
its brief, so the measure reports 1210–6990 Unit-seconds of exactly that and cannot call any of it a
fault. The target needs restating against the Latitude ladder before it is a thing that passes or
fails. Rank 8's *under 10ms on 250×250* names a grid larger than the ceiling battle, which is
240×150; the grid was never the hard part, and the number nearest the line is corner to corner, which
came in at 4.4ms, 4.7ms, 4.8ms and 5.0ms on four runs of the same commit. Nothing through the gorge
comes close: 0.16–1.49ms. The gorge was the worry and the open diagonal is the cost.

## 9. Tradeoffs — Got / Paid / ADR

| ID | Tradeoff | Got | Paid | ADR |
|----|----------|-----|------|-----|
| T1 | Rigid blocks over agent soldiers | ~40 simulated bodies; no per-man steering, collision or pathing; exact Formations | no emergent melee churn or rout scatter; Contact must be abstract | — |
| T2 | Figures rigid in their slots | trivial rendering, exact geometry | transitions must be morphed by C3 or Formations visibly pop | — |
| T3 | Scripted Plan over tactical AI | no planning AI to write; scenarios become authorable content | no adaptation; a battle is fresh once or twice; no skirmish generator | — |
| T19 | Clock over Army Break as the ending | battle length is a known budget, the same every time; small Rosters stop cutting the afternoon short | Key Ground carries nearly every result and is not yet authored to; a decided battle can leave twenty minutes of dead clock, released only by Break Off | ADR-0006 |
| T4 | TypeScript over Godot | velocity in a known stack; ships as a link; pure testable sim | no editor for free — mitigated by T5 | [0003](./docs/adr/0003-typescript-with-a-pure-simulation-core.md) |
| T5 | Terrain painted as images over a built editor | F17 drops from "build an editor" to "write a loader"; historical maps can be traced | terrain is opaque in diffs and ungreppable | [0005](./docs/adr/0005-terrain-is-authored-as-images.md) |
| T6 | Three Grades over five | one fewer axis to balance | Jeune and Vieille Garde collapse into one rung | — |
| T7 | Whole-battalion Open Order over detached skirmishers | "one Unit, one Formation" holds | no screen-plus-main-body; a battalion skirmishes entirely or not at all | — |
| T8 | Fixed camera over zoom and pan | zero camera work; forces legibility at the hardest scale first | Field capped at ~1920m, so Austerlitz and Leipzig need named sub-actions or a different game | — |
| T9 | Terrain-only Concealment over fog of war | no scouting, ghosts or report decay; one uncertainty layer instead of two | no intelligence to gather; every ambush is readable off the map by a careful player | — |
| T10 | Powder Smoke drawn but inert | legibility preserved, and measured rather than asserted: behind the bases the silhouette is never in the argument, and *one accumulator* taken literally makes the cap exact at 0.268 however many battalions fire into the same ground | the firefight-stalemate dynamic isn't modelled — and there is no dial, because inert means the sim never sees the smoke: turning it on is moving the rule into C6, not changing a number | — |
| T11 | Morale as the health bar, not casualties | the period's actual dynamic; Pursuit and Rally become real decisions | harder to tune; no legible bar the player can count down | — |
| T12 | Unit sized by a Frontage band, not a historical title | one model across every army and campaign | an Austrian cavalry regiment is four Units, which reads oddly on a roster | [0001](./docs/adr/0001-unit-is-always-a-battalion.md) |
| T13 | No save | no serialisation of simulation state at all | a 40-minute battle is all-or-nothing | — |
| T14 | Rule list over behaviour tree or utility scoring | every autonomous act has a nameable cause, so F7 is free; deterministic; authorable as data | no subtlety and no coordination between Units; the list grows long and order-sensitive | [0004](./docs/adr/0004-initiative-is-an-ordered-rule-list.md) |
| T16 | A Latitude ladder leashed to the Post, over Initiative that never advances | a Unit answers what it can see without a ninety-second Courier ride for a hundred metres of ground; the brief scales with the Field where the Courier does not | the rule list now reads differently on different Units, so a Dispatch's cause has two halves; a rung can be set and forgotten | [0007](./docs/adr/0007-a-standing-order-sets-a-units-latitude.md) |
| T18 | Three map reads on a 2.6px bar, over a panel the player has to open | Arm, Grade and Morale are readable without selecting anything, so G2 covers a Unit and not only its Formation; Morale is on the map at all, where before it appeared only once a Unit had already Broken | every channel a Unit has is now spoken for, so a fourth read has nowhere to go but a glyph; all three are learned rather than labelled, and nothing on screen teaches them | — |
| T21 | The glyph spent on Disorder, over a Formation glyph or a fourth channel | the one read on a Unit that no silhouette, hue or edge could ever have carried — and it decides whether the Unit can make square or go at anybody, so it is the read the player most needs before he picks a Unit up | the last rung of §8 rank 7's fallback ladder is gone, so a silhouette that fails at 0.7px/m now has no answer written down; a fifth read has nowhere at all to go; and the mark is learned rather than labelled, like the other four | [0012](./docs/adr/0012-disorder-is-what-a-mob-costs-the-troops-it-runs-over.md) |
| T17 | A Headquarters that can be harried and ridden over, against one that can be captured | *where do I stand* becomes a decision the player makes all afternoon; ADR-0002's other half — it can be shot at — is finally built, and off the beaten ground C6 already draws | a flat surcharge compresses the distance gradient F1 rests on, worst for the Orders with the shortest way to go; the enemy pays nothing for any of it until its own Orders are couriered | [0008](./docs/adr/0008-the-headquarters-rides-and-can-be-harried.md) |
| T20 | Fatigue bought by the pace, over a cost per action | one law covers a flank march, a Rout, a gallop and a battery limbering up, so Pursuit costs what running costs without a rule of its own; Formation reaches Fatigue through its speed and never through a table, so F8 survives the easiest place to break it | a Formation that is slow because it is hard to hold together — a line over broken ground — reads as restful; nothing is saved, so it is an afternoon's arithmetic and cannot carry into a campaign | [0010](./docs/adr/0010-fatigue-is-bought-by-the-pace.md) |
| T22 | Server-authoritative over host-authoritative and lockstep | blind Deployment and the Report rule enforceable against *both* Commanders rather than one; a battle that outlives the tab, so Out of Contact is survivable; no silent desync | F19 splits in two; a process to deploy and keep alive; two implementations of one seam, and a rule inside either of them is two games | [0013](./docs/adr/0013-a-battle-with-two-commanders-lives-on-a-server.md) |
| T23 | A drop is Out of Contact, not a Break Off | a router no longer costs twenty-five minutes; and no timeout logic at all, because the Scenario clock already is the timeout | an army fights on with nobody commanding it, so C2 carries more than it was built to; and the other Commander is told, which is information he would not otherwise have | [0013](./docs/adr/0013-a-battle-with-two-commanders-lives-on-a-server.md) |
| T24 | Reports and Dispatches are the Commander's own army's — in solo too | one rule across both games instead of two; and T11's refusal of a countable bar finally enforced, since a selected enemy Unit no longer hands over an exact man-count | F7's *every consequential event* becomes every one of yours, and the half it drops is the interesting half — a rule taken for G8 and charged to G9 | — |
| T25 | Tempo asked for, not set | neither Commander can impose the pace of the afternoon on the other, for the price of one `Math.min` | wall-clock length stops being knowable in advance, and a Commander who is losing can hold the other at ×1 for the full half hour | — |
| T26 | Bun for the server, and the tests moved with it | the backend adds no build step and no dependency — extensionless imports resolve and the socket is built in; and the authority and the baseline stay on one engine | tests no longer share an engine with a Chrome player's solo battle, and §8's measured numbers have to be re-taken under `bun test` rather than carried over | [0014](./docs/adr/0014-one-javascript-engine-for-the-simulation.md) |
| T27 | A Unit holds the ground under its Footprint, enforced by refusing the step | a screen and a second line are finally worth something — a Charge strikes what stands in front of what it was aimed at, and a march stops against an enemy instead of walking through him; no steering, no shoving, and nothing that has to decide which of two battalions gives way | a Move Order can be held indefinitely and silently by an enemy standing on its destination; Disorder roughly triples across the nominal runs; and Open Order needed an exemption before the rule could be measured at all | [0015](./docs/adr/0015-a-unit-stands-in-ground-of-its-own.md) |
| T15 | Two nominals plus fixtures over one nominal | honest coverage — Rivoli under-tests exactly what Castiglione tests | two Fields to author before the design is validated at all | — |

### Tensions being watched (unresolved by design)

- **Initiative versus player agency.** Held at bay by the leash: what a Unit may do unbidden is one rung of its Standing Order, and every rung is spent in metres from the Post. **Measured, and not tripped.** Now that Rosters carry a rung, the four silent nominal runs are the run this line asks for: an army briefed above `hold ground` and a player who says nothing all afternoon. The winner is the same in all four as it was with every Unit at `hold-ground`, and the leash is spent to the metre and never past it — 100m, 250m and 300m at the three rungs. What a brief buys is not the battle but a harder one: Rivoli's briefed Austrians take the same result for 58.6% gone instead of 27.6%. *Also measured on the fixture before the ladder existed and not tripped: with no Orders the battle does not resolve at all — thirty minutes, no crossing, no Army Break, and the bridge held by nobody.* **Trigger to reopen:** a briefed army that starts *winning* battles the player sits out, rather than merely bleeding for them.
- **Courier delay versus battle length.** Both tuned against Castiglione, in opposite directions. **Trigger:** when a 20-minute battle allows fewer than about three order-cycles to the far flank.
- **Geometry purity versus tunability.** Global scalars only, so far. **Trigger:** the first time a target can only be hit with a *per-Formation* constant — at which point F8 is dead and should be struck rather than quietly fudged.
- **Powder Smoke versus silhouette legibility.** Capped opacity, drawn behind Unit bases. **Built and measured, and it is not a silhouette problem.** Behind the bases, a Unit is drawn over its own smoke and F5 never enters it; counting the keyline as well as the body, a bank makes an elite battalion and a line battalion *easier* to find. The one Unit it costs is a white conscript, whose Grade is drawn as having almost no keyline — one battalion in the six Rosters authored. **Trigger:** a Roster that fields conscripts in the white army in numbers, at which point the Grade channel and not the smoke is what wants revisiting.
- **Smoke as a blinding mechanic.** Deliberately not built. There is no dial to turn, and building the drawn half made that sharper rather than softer: the clouds are renderer state that the simulation cannot see at all, so blinding is not a scalar going up from zero but the rule moving into C6 and being measured from scratch. **Trigger:** if firefights resolve faster and more decisively than the period suggests they should.
- **The bayonet charge is weak, and the attack column weakest of all.** A charge in line takes 33
  men and 0.26 Morale off a line; the same battalion charging in attack column takes 11 and 0.09,
  because a third of the frontage meets. Against fresh infantry an infantry charge does nothing,
  which is period-true — frontal assaults on steady lines failed — but it leaves the attack column
  earning its place on speed and on being a poor target rather than on carrying positions.
  **Trigger:** a Castiglione where the column is never the right way to attack.
- **Command friction is the player's alone.** *Resolved by
  [ADR-0013](./docs/adr/0013-a-battle-with-two-commanders-lives-on-a-server.md).* A Headquarters
  that was harried or ridden over cost the enemy nothing, because the Plan applies its Orders where
  they land instead of couriering them — so the whole of ADR-0008 was a rule only one army obeyed,
  drawn only for the army that obeyed it. The trigger written here was *the first enemy commanded
  through Couriers rather than through an authored Plan, at which point the rule is already written
  and the enemy Headquarters wants drawing*, and that is exactly what arrived: a second Commander
  couriers his Orders from a Headquarters that can be harried, ridden over and aimed at, and it is
  the one piece of his command apparatus the other can see. **The staff is now drawn** — both of
  them, filled for your own and hollow for his, because one of the two armies is white and hue alone
  would not tell the marks apart. What is *not* symmetric and never will be is the solo battle,
  where `firePlan` applies its Orders where they land, so the enemy staff can be harried and ridden
  over and the script goes on commanding exactly as fast. **Drawing it made the asymmetry visible
  instead of merely present, and turned it into a decoy:** against a Plan, a mark that looks like
  the most valuable ground on the Field is worth nothing to take, and a player who spends his horse
  on it has spent them. Left drawn rather than hidden in solo, because a Field that shows one thing
  in one game and another in the other is the split ADR-0013 exists to prevent, and because the mark
  is honest — it is where his staff is. So this closes for G8 and stays open for every battle fought
  against a script. **Trigger:** a solo player riding at the mark and finding out the hard way, at
  which point the answer is to courier the Plan's Orders rather than to stop drawing the staff.
- **Fatigue against a thirty-minute clock.** Bought by the pace, so infantry at 0.8–1.4 m/s tires slowly by design and cavalry at the gallop tires fast. **Trigger:** a Castiglione where no Unit is ever winded, in which case the rule is decoration for two Arms out of three — or one where a battalion is blown before the first Volley, which is an afternoon spent watching men who cannot fight.
- **A Pursuit costs all three of its prices.** *Resolved by
  [ADR-0012](./docs/adr/0012-disorder-is-what-a-mob-costs-the-troops-it-runs-over.md).* The run-in
  was priced by ADR-0010 and the walk home by the mob having run to its own rear; the ranks are now
  priced by Disorder, and by the same trick — the pursuer is disordered afresh every step he is
  among them and re-forms only standing still, so the length of the ride is paid for by not being
  home yet. Nothing counts it. What is *not* measured is the price in a battle: no nominal run
  reaches a Pursuit at all, so the whole of this rests on the fixture. **Trigger to look again:** the
  first Scenario in which the enemy Plan lets horse go at anybody.
- **Re-forming under fire.** ADR-0011 keeps Morale from mending between two Volleys; nothing keeps
  ranks from mending between two Volleys, so a battalion dresses itself in half a minute inside a
  firefight. Left as the honest first version rather than two rules of the same shape stacked on the
  same afternoon before either is measured. **Trigger:** a Unit visibly re-forming in the middle of a
  fight it could not have dressed in.
- **Three engines, and only two can agree.** The simulation runs in the tests, on the server and in
  the player's own tab. ADR-0014 aligns the first two, which leaves a solo battle in Chrome running
  on an engine no test covers. **Trigger:** solo play being where the bugs actually come from, at
  which point the alignment should flip and the ADR be revisited rather than worked around.
- **The feed teaches, and the cut halves it.** T24 takes enemy Dispatches away in every battle, and
  §5 says the feed is the only surface G9 scores 9 on. The version not built is a **causeless line**
  — *what* for both armies, *why* for yours — which buys back half the lessons for one rule. Left
  unbuilt because it would design G9's answer on the strength of a matrix cell assigned the same
  afternoon, and because a Dispatch with no cause is what CONTEXT's `_Avoid_` list calls a
  notification. **Trigger:** the first measurement of what the feed actually teaches. If it is the
  main teacher, this is the first thing to reconsider.
- **Two implementations of one seam.** The local session and the remote one both talk to
  `src/sim/`, and the only thing keeping them one game is that neither may hold a rule. **Built, and
  the guard has already been spent once**: Deployment is a Commander moving men by hand, both
  sessions do it, and the arithmetic that holds a Unit inside its zone therefore went into
  `sim/deployment.ts` rather than being written twice. There are two differences left and both are
  about a *session* and not a battalion — a solo battle can be paused and a two-Commander battle
  cannot, and blind Deployment applies only where there is a second army being arranged.
  **Trigger:** the first behaviour that exists in one and not the other — at which point
  ADR-0013 has been broken rather than extended, and should be superseded rather than quietly
  stretched.
- **A state message is 9.46KB and there are ten a second.** 94.6KB/s to each Commander and about
  189KB/s out of the server, measured on a running Castiglione across a real connection rather than
  estimated. What makes it a tension rather than a bug is that the cheap fix is a mirage: field
  names are 55.6% of the message, so rounding every coordinate to a centimetre takes 2% off.
  **Trigger:** a battle across a real connection where the Field stutters — which has now been
  fought without stuttering, so what is left of this row is the bill and not the feel: about 57MB a
  Commander for a Castiglione at Tempo 4, because the rate is wall-clock and not Scenario clock. The
  answer, when it comes, is a shorter encoding or a per-Unit delta, never a slower tick, because the
  tick is the simulation's own 10Hz and F14 draws between two of them.
- **A battle now outlives the tab that opened it.** T13 says *no save — no serialisation of
  simulation state at all*, and that is still true: the state was never written down, it simply
  lives in a process. **Trigger:** wanting a battle to outlive the *server*, at which point T13 is
  properly dead — and the design for it is already written down, in ADR-0009's *a Scenario, a seed
  and the Orders given*.
- **G9 has a Goal and no Function.** Deliberate, and the row should stay visible. G8 sat unclaimed
  for six milestones because T3 recorded its cost and no Goal ever asked for it; this is the same
  shape caught on purpose rather than by luck. **Trigger:** measuring what the Dispatch feed and the
  Scenario `summary` already teach — because the answer may be that most of G9 is built and nobody
  had noticed.
- **Campaign persistence.** Not the **Campaign** that now shelves the battles — that one is a heading and carries nothing. This is state crossing between two Scenarios on the same shelf, which is the thing the term is defined to exclude. Rosters are already standalone files, so the door is open. **Trigger:** wanting casualties from Lodi to still be missing at Castiglione.

## 10. Inconsistencies spotted and fixed

- **F18 has never been true without naming an engine.** Its target reads *bit-identical outcome*,
  and `sin`, `cos`, `hypot` and `atan2` are implementation-approximated — 42 call sites in `sim/`.
  Solo play already simulates in the player's own browser, so a Safari player has been on JSC and
  potentially off §8's numbers for six milestones. It never bit because one person on one browser
  was both the player and the test harness. Target amended to *per JavaScript engine*
  ([ADR-0014](./docs/adr/0014-one-javascript-engine-for-the-simulation.md)).
- **F19's target was absolute and is now conditional.** *Static assets, no server* described the
  whole product; it describes solo play. Amended rather than deleted, because the solo half is what
  keeps G6's link a link to a file and not to infrastructure.
- **F19 had no row in the function → component map at all.** Its component was "build config", so it
  was silently dropped from §7 and contributed nothing to any component's Σ. It now points at C16,
  which is the honest answer to *what builds the thing F19 describes*.
- **Solo play was leaking an exact enemy man-count, which T11 had explicitly refused.**
  `useBattle.ts:642` allows an enemy Unit to be selected "to read it, never to order it about", and
  `TheBattle.vue:328` renders the full card merely `disabled` — so a selected enemy battalion handed
  over its Strength in men, its Fatigue and its aim. T11 gave up the countable bar on purpose and
  then a panel counted it down perfectly, for the wrong army. **Built**, by T24, in solo as well as
  in a two-Commander battle: a `UnitSnapshot` now carries a `report` that is null on the other
  army's Units, and the card prints men, pace, Fatigue, the Initiative rule holding it and its brief
  only when there is one.

  Two things came out of building it that the rule as written did not say. **Strength could not
  simply be withheld** — a Unit's Footprint is built out of it, so cutting it leaves the enemy with
  no ground to stand on. It is sent at the resolution the Field itself shows: rounded to ten men,
  which is what one Figure stands for, so the drawing is unchanged and a battalion's front moves by
  under a metre in a hundred and forty. The head count to the man is what a Return is for. And **the
  Report had to be wider than *"Strength, Fatigue, aim"*** to mean anything: what a Unit has been
  briefed to, whether it is under Orders, and the name of the Initiative rule holding it are all his
  staff's word rather than your glass, and leaving them on the wire would have been a larger leak
  than the head count. Per-Volley casualties went the same way — a stream of them adds back up to
  the exact Strength the rounding had just taken out, so a `VolleySnapshot` carries the flash and no
  butcher's bill.
- **The Deployment window was five minutes against a ten-minute battle.** Castiglione's clock is
  2400s and `useBattle.ts:123` defaults Tempo to 4. Nothing in F11 or G4 catches it, because both
  measure the Scenario clock and the Scenario clock is untouched. Found by putting two numbers
  beside each other in §8; fixed by making one of them three.
- **Enemy Couriers were drawn, and had never once been exercised.** `BattleView` filters Ghosts by
  army (`:1085`) and draws only its own Headquarters (`:1600`), but walks *every* Courier
  (`:1569`) — safe for six milestones only because the Plan applies its Orders where they land and
  has never put a rider on the Field. A second Commander would have made the enemy's Orders visible
  the first time anyone played. **Fixed** with the rest of the cut: the other army's riders are
  filtered out of the snapshot behind a constant that starts at nothing. Watching where a rider goes
  is watching a Commander think, and F2's promise that every pending Order is on the Field is a
  promise about your own.
- **The teaching material G9 asks for was already authored.** Every `scenario.json` carries a
  `summary`, and Rivoli's is 130 words of Alvinczi coming down off Monte Baldo divided by torrent
  gullies. It is a briefing, not a history lesson — exactly what G9 wants — and it is read once on
  the menu and never reaches the Field.
- **"Player" and "Commander" are the same person and CONTEXT now only allows one of them.**
  `CONTEXT.md` has been swept (15 uses; only the two `_Avoid_` entries remain). `DESIGN.md` §1 has
  been corrected and the rest of it, along with `README.md`, has not. Recorded rather than fixed,
  because a blanket rename across 118KB of prose is a change to make deliberately and read
  afterwards, not a side effect of a design session.

- **"Soldier" meant two different things.** Defined as "one man in a Unit", then used as "one drawn figure per five men" — so `unit.soldiers.length` would never have been a Unit's Strength. Renamed to **Figure**; Strength counts men only.
- **"Rigid men" read as popping Formations.** Figures snapping to slots, taken literally, means a battalion holds its line for forty seconds and then jumps into a square — violating G7. Resolved: Figures are rigid *relative to* their slots; the slot layout itself morphs (F12).
- **ADR-0003 mandated a fixed timestep without mandating interpolation.** At 10Hz, drawing simulation positions directly judders regardless of frame rate. F14 added and the ADR amended.
- **Crossing was defined too narrowly.** "A passable strip over impassable *Ground*" — but Rivoli's Osteria gorge is passable ground between impassable *slopes*. Widened: impassability comes from Ground **or** gradient, so a cliff is a Height, not a Ground.
- **Concealment claimed terrain was the only thing that hides anything.** Powder Smoke would have falsified it. Resolved by keeping smoke inert rather than by weakening the claim.
- **"A Unit is a battalion" was a French assumption.** Austrian cavalry regiments ran 1,000–1,400 men against a French 250, so no historical title unifies across armies. Resolved to a derived **Frontage** band with size as Roster data.
- **G4 had no functions.** "A battle has a shape" survived the whole functions pass unserved, and was only filled when Rivoli proved unauthorable without **Arrival** — which then ranked third overall.
- **G2 was served by one read out of four.** "Silhouette and colour say what everything is doing" is carried by F5, and F5 is about Formation; nothing in the function list put a Unit's Arm, its Grade or its Morale on the map. Colour was already spent on the army, so a battalion in line, a cavalry regiment in line and a battery in battery were the same picture — an army-coloured bar with a white front edge, 102px by 2.6px — and how a Unit was holding up appeared only once it had stopped holding up at all and turned into a mob. Resolved with one channel each and no glyph (§7), so G2 is still carried by the drawing of the men rather than by UI. The function is still unwritten: §2 has no "read a Unit's Arm, Grade and Morale off the map" row, so §5 and §7 are scored as though C10 only owed F5 a silhouette, and C10's rank of 3 is an understatement by however much this is worth. Left that way rather than scored on the spot, because inventing a weight to justify work already done is how a house of quality becomes decoration.
- **A broken outline read as a segmented one.** Grade and Morale were first drawn by fraying a Unit's outline, which is the diegetic answer — drill is what buys a battalion its dressing. At 2.6px front to rear the dashes on the two long edges land two pixels apart and close up into a chain of little boxes, which reads as a Unit standing in separate blocks: exactly and only what cavalry's squadron intervals are there to say. It also drowned Grade, conscript and elite being told apart by a pattern that was already the loudest thing on the bar. Now a closed outline may only be broken above `RAGGED_FLOOR_PX`, which square alone clears at 26px; every thinner Unit breaks its Face, which is a single line and cannot read as anything but broken. Grade went to weight instead. Caught by drawing the whole matrix — three Arms by three Grades by four rungs of Morale, both armies, at the real 0.7px/m — and looking at it, which is the only way any of this can be checked.
- **Rivoli was claimed to test everything.** It under-tests Formation play and cavalry badly, because its slopes leave little manoeuvrable ground. Resolved with two nominals and purpose-built fixtures.
- **Three terms were tourism, not domain.** "Point of interest" → **Key Ground**; "smog" → **Powder Smoke**; "event feed" → **Dispatch**.
- **Terrain reached a Unit through a square the size of its longest side.** A battalion in line
  is 140m across and 4m deep, and the Footprint was sampled as a 140m square: 361 cells, 18 of
  them under the battalion. Nine tenths of what slowed a line down was ground it was not standing
  on. Now sampled along the Unit's own axes, the way its slots are laid out.
- **One Ground cost was doing two jobs.** As an A\* weight, marsh at 3.5 is right and should push a
  Route round it. As a divisor on speed it put a battalion in line at 0.23 m/s — 14m a minute, on
  a 30-minute clock, a Unit that has stopped. Split: routing keeps the full weight, speed takes
  half the malus and the road keeps its whole bonus.
- **A battery In Battery was merely slow, not stationary.** 0.2 m/s meant guns could be dragged
  into position off their limbers, which is not a thing that happens. Now zero, with an Initiative
  rule that hitches up to move.
- **The traverse was a wheel with the numbers filed off.** Standing the battery's turn on the
  wheel floor made the time it takes fall out of Frontage, which is right for a wheel and wrong
  for a traverse: a wheel is paid for in ground, by the outer flank walking the arc, and a
  traverse is paid for in men, by every crew handspiking its own piece at once. Twelve guns are
  216m of front, so a quarter turn cost seven minutes of a thirty-minute battle and got worse the
  bigger the battery. Now a rate scaled by **Grade** — it is drill, not marching — and derived
  from the Formation having no speed rather than authored, so nothing declares it twice.
- **The one Order guns can obey was unreachable.** The sim would traverse a battery on a **Move**
  onto the ground it stands on, and had a test saying so, but every Order comes from a drag begun
  on bare ground and a six-gun battery covers 108m of it. The player could only ever order the
  guns somewhere else, which limbers them. Two gestures now issue it — a drag off the Unit's own
  body, and a **point** button armed like a Charge — and both read the bearing from the Unit's
  centre, because a press on a battery's flank is a destination fifty metres away.
- **"Only a march column crosses" was authored as a rule about Formations.** It is a fact about
  the gap: a bridge deck is 8m and a line is 140m. Stated as Frontage against the width of the
  Crossing, which is also the only version the Osteria gorge does not contradict.

- **Fire was counted with an overlap that guns do not obey.** How many weapons bear was
  Frontage against Frontage for everything that shoots — right for a musket, which points
  wherever its rank points, and wrong for a gun, which is traversed onto what it is firing at. It
  had five of a battery's eight guns shooting at open ground either side of a column, and made a
  column the safest place on the Field to stand in front of artillery. Split by weapon and not by
  Formation: laid pieces bear whole, levelled ones bear by overlap.
- **A shot's chance of hitting was flat, so depth only told against round shot.** One hit chance
  per Arm, with the target's depth entering only through what a ball could plough. That left the
  hazard of standing deep as an artillery problem alone — but a musket ball that misses the front
  rank of a column has eight more ranks to find. The chance is now per body and compounded over
  everything in the shot's path, which also gives enfilade fire its lethality with no rule for it.
- **"A line beats a column" was assumed to mean it kills more.** It does not. Two thirds of the
  line's muskets are pointed past a column, and the third that bears finds three times the depth;
  the two very nearly cancel. What the column loses is the *exchange* — it can only reply with
  the muskets its own Frontage carries. The period's lesson stands, for a different reason than
  the one the design had written down.

- **Grade was given a flat multiplier on how lethal a Volley is.** CONTEXT forbids exactly that,
  in as many words: Grade buys rate of fire and steadiness under fire, and never a damage bonus. The multiplier is gone. Grade now reaches lethality the way the glossary
  says it does — through Morale, because a steady battalion keeps firing as it was drilled to and a
  shaken one does not, and Grade is what decides which it is.
- **Break was nearly written as a rule about Morale rather than about the Rout.** A rule reading
  "Morale has given out" stops matching the instant Morale creeps back, which it does while the
  Unit is still running — handing a mob at full flight back to the rule that files it into column
  for the bridge. The rule asks whether the Unit *is Routing*; only the Rally rule, above it, can
  end that. Morale decides when a Unit Breaks and never when it stops.

- **Square was assumed to resist by depth. It resists by Frontage.** The design had a square
  holding because four ranks stand behind its Face against a line's three — which is barely a
  difference, and would have needed a constant to become one. What actually saves it is that a
  36-metre front lets a quarter as many sabres reach it as a 140-metre front does: four times the
  Morale, out of geometry that was already there. It is the same quantity that makes an attack
  column safe from a charge and, read the other way, the depth that makes it a gift to round shot.

- **Charging in line hits harder than charging in column, which is not what the period says.**
  More bayonets meet, so more men fall — three times as many. The column's virtues here are speed,
  a narrow front to be shot at, and resistance to being charged, and none of them is the moral
  weight the period gives it. Left as measured rather than fudged with a constant, and recorded as
  a tension in §9 with a trigger.

- **Initiative trying to make square can be worse than not trying, and that is deliberate.** A
  Unit halfway between two layouts has no Face at all, so a battalion caught mid-drill is undone
  where one that stood in line would have thrown the charge back. CONTEXT already said a Unit is at
  its worst while it changes Formation; this is the first mechanic that makes it cost something. It
  is also the strongest possible argument for forming square *before* the horse is let go, which is
  the player's decision and not the rule list's.

- **"Contact ends when one Unit Breaks" needed splitting from who says so.** Off a Face the Contact
  is the cause and breaks the Unit on the spot. On a Face it does not: it takes men, Morale decides,
  and the Rout is declared a tick later by the Initiative rule that gets to name the reason. So the
  Contact reports the outcome and never delivers it, which keeps every Rout attributable to C7.

- **A Charge had to stop being free somewhere, and CHARGE_RANGE was written as standing in for
  Fatigue.** Only the last hundred and fifty metres are run, so closing the ground first is a Move
  Order and a Courier ride, and the Charge itself is the last twenty seconds. This entry used to
  end *Fatigue replaces it rather than joins it*, and that was wrong twice over. The seam is not a
  tax standing in for Fatigue — it is Fatigue as the period practised it, which is why horse walked
  up and galloped home; and dread is charged per second of a Charge coming on, so running the whole
  way would hand the target eighty-six seconds of it against twenty-one and break a fresh battalion
  by fear before anybody reached it. Fatigue joins it, and prices the rest of the afternoon that the
  seam never reached (ADR-0010).

- **Army Break was written as a tally and is a moment.** "Enough of an army's Units have Broken"
  reads as a running total, and a total never comes back down: a commander who got two battalions
  back in hand would still be carrying them as losses for the rest of the afternoon, and a Rally
  would be worth something to the Unit and nothing to the army. It counts what is running *now*,
  so the share falls as well as rises. That is also the more period-true claim — an army breaks in
  the moment too much of it is running at once, and it is the cascade that ends a battle rather
  than the arithmetic of the day.

- **Army Break at a third was period-true and ended the fixture in five and a half minutes.** Two
  Austrian battalions broke; on a four-Unit Roster that is 44% weighted, and the army quit with two
  Units in hand and a Plan Order due at 7:00 that never fired. The threshold was not mistuned — the
  weighting puts one battalion at 22% and two at 44%, so the whole end condition lived in the gap
  between the first and the second and there was no state in between. Any threshold below 1 has
  that gap on a small Roster. Resolved by making the clock the ending and Army Break the floor
  under it, at 1 (ADR-0006). The bill is that Key Ground now decides nearly every battle, and on
  the fixture only one army ever stands on it.

- **The end condition could not see the road.** §6 flagged the conflict between Army Break and
  Arrival and left it to the end condition to solve. What solves it is which side of the count the
  road sits on, and the fix is one line: an army is measured against its whole Roster, fixed at
  Deployment, and a Unit still walking on counts as standing. Nothing had to know about Arrival at
  all — the denominator already did.

- **Weighting Army Break by Grade means a squadron costs what a battalion does.** Two hundred
  horse and seven hundred foot are the same loss, which is plainly wrong about bodies. It is kept,
  because Army Break counts *Units* that have Broken and what the army has lost is a place in the
  line, which is the same width either way. Weighing men instead would also have let casualties
  push an army toward breaking, and F11 is explicit that a battle never ends by annihilation.

- **Initiative's effect on a live Order was never stated.** Cancelling would strand a battalion in square in an empty field until a new Order arrived ninety seconds later. Resolved: Initiative **suspends**, never cancels.

- **The Field offered a Charge that C6 would refuse.** Aiming outlined every enemy, a Routing one
  included, while C6 pulls the chargers up the moment the Order reaches them because Pursuit is not
  built. So the player picked a mob, paid the Courier ride, and watched the regiment stand still —
  the one shape of bug ADR-0002 cannot absolve, since the delay is the game and spending it on
  nothing is not. Resolved by stating what may be aimed at *next to the pull-up* rather than in the
  screen: no outline on a Routing Unit and no Order sent, so the offer is exactly what the
  simulation will accept, and building Pursuit moves both at once. *Pursuit is now built, and both
  moved together: a mob is outlined for horse and refused to foot, which is the same rule read
  against the Arm that has to catch it.*

- **Pursuit denying a Rally was written as a rule and needed none.** CONTEXT says a Pursuit
  denies a Rally outright, which reads as a clause somewhere in C7 — a flag on the Unit, or a
  question `canRally` has to ask C6. It is neither. A pursuer takes about a twentieth of a point of
  Morale off the mob every second it is among them and standing anywhere gives back a six-hundredth,
  so a Unit ridden for a minute is three points under a floor at a quarter, and the afternoon is not
  long enough to climb it. The denial is the arithmetic the design already had, and the only thing
  that had to be written down was where to look for it — a note on `canRally`, which is where a
  reader will go asking.

- **"Fire and movement do not mix" was a rule about the Order, and it denied Open Order the one
  thing it exists for.** A Unit fires only where it covered no ground in the step, which is right
  and load-bearing — it is what makes **Halt** worth an Order and an advance under fire cost
  something. But it was applied to every Formation that has reach, and skirmishing *is* fire and
  movement: men advancing, firing and falling back inside the swarm. Open Order walks at 1.2 m/s
  against a line's 0.8 and is mostly the ground between men, and every bit of that was worthless,
  because the screen had to stand still to shoot like the line it was screening. What halting
  actually buys is a dressed **Face**, so the rule now reads off the Face and not the Order: a
  Formation with no Face has no line to dress and fires on the march. Derived from `faces` and
  `range`, so nothing is authored per Formation and F8 stands — and it picks out Open Order alone,
  march column and limbered guns having no reach and cavalry no fire at all. Paid for in the
  reload, by one global scalar, and never on the Volley, which stays purely geometric: a
  skirmisher gets a shot off every forty-five seconds against a halted battalion's twenty-two.

- **A skirmish screen's fire did not thin until 240 metres.** The Faceless case measured both
  bodies by their longest side rather than along the line of fire, so 700 men in Open Order — 187m
  across and 18m deep — were credited with 93m of their own standoff whichever way they shot. The
  gap a ball crossed was therefore zero out to nearly two hundred metres, and a screen's Volley at
  140m was worth exactly what it was worth at 60. Harmless while skirmishers had to halt to matter;
  the moment they fire on the march it is the difference between harassment and out-ranging a line
  for nothing. Now read the way a Face reads it — the extent each body actually presents along the
  bearing — so a screen's beaten ground is its own Footprint blown out by the range on every side,
  9m of standoff to the front and 93m along the screen. The renderer samples the same standoff
  rather than drawing a circle, because a beaten ground drawn where the fire is not is the one kind
  of lie F5 cannot afford. Measured: 15.7 men a Volley at 60m against a line's 29.1, 7.4 at 110m,
  and nothing past 111.

- **The beaten ground that fixed it was a peanut, and it still out-reached the line it screened on
  every bearing but the one the fix was checked on.** Blowing a Footprint out by the range on every
  side gives a rounded rectangle, and that is what the prose above says. What the Faceless case
  measured was the Footprint's shadow across the bearing used as a radius — exact dead ahead and
  along the flank, generous in between. A 560-man screen was credited with 145m of reach at 30° off
  its own front, where the nearest man it had stood 126m from that ground: 19m of fire with nobody
  to fire it. The two lobes met in a concave notch at the front and rear, which no dispersal of men
  can produce and which was the thing visible on the screen. Now measured as the gap between two
  Footprints taken corner by corner, and as a point-to-Footprint distance where the target is a bare
  point like a Headquarters. Dead ahead is unmoved — 109m against the line's 101.8m, the difference
  being the screen's own 18m of depth — and the diagonal gives back up to 19m. The renderer solves
  the same shape for its outline instead of sampling a standoff, so the edge it draws is convex
  because the ground is. Held by a test that walks every 5° and asks the men rather than the
  measure: nothing a Unit beats is further than its range from somebody standing in it.

- **"The Headquarters can be moved, and can be shot at" was written in ADR-0002 and neither half
  was built.** Sited once at Deployment, it turned the one decision the whole delay mechanic exists
  to pose into a fact about the player's setup: asked before the clock, against an afternoon he had
  not seen, and unrevisable for the next forty minutes. Building the ride on its own would have been
  worse than leaving it — with nothing able to touch it, a movable Headquarters is a button that
  makes every Order faster, dragged forward behind the line all afternoon, and F1's distance stops
  costing anything. So the ride and the danger are one feature (ADR-0008), and the danger is read
  off the beaten ground C6 already draws rather than off a radius of its own: a battery on a ridge
  harries a staff eight hundred metres away, and a line firing over its head does not. The failure
  it refuses is *capture*: an army that cannot be ordered at all is a lost battle the player still
  has to sit through, and ADR-0006 spends the clock's full length on purpose.

- **A harried Headquarters delays the near Orders proportionally most, and that is the trade taken
  knowingly.** Twenty seconds is most of the ride to the reserve behind you and a sixth of the ride
  to the flank, so the surcharge halves the ratio F1 is built on at exactly the moment the battle is
  at its most interesting. The alternative — slowing the riders instead — keeps the gradient and is
  *invisible*, and ADR-0002 draws the Courier precisely because an unseen delay reads as lag. A
  wait at the table can be drawn: the rider sits at the Headquarters, the Ghost is already out on
  the Field, and the Order is visibly written and visibly not gone.

- **Open Order out-ranged the line by fifty metres, and that was its survivability charged twice.**
  It was the one infantry Formation whose `range` was not 100 — the per-Formation combat constant F8
  exists to forbid, sitting in the table in plain sight. Reach is a fact about the musket and the man
  carrying it, and it is the same musket and the same man; what the Formation buys is Density, and
  Density already pays out — most of what is sent at a screen finds the ground between the men, which
  is why it is the safest place on the Field under guns. The extra fifty metres bought a second
  thing on top: a band from 111m to 161m, centre to centre, where the screen fired and no line could
  answer. Against a line that band is not a band but a game: a line cannot fire while it marches and
  walks at 0.8 m/s against the screen's 1.2, so the screen backs away inside its 250m of `stand-off`
  leash while the line spends its 100m of `close-up` and never arrives. Measured before the change,
  twenty minutes of it with nobody issuing an Order: the line 700 to 403 and routing, the screen
  untouched at 700. Now every infantry Formation that can fire reaches the same hundred metres, so
  any ground a screen can fire from is ground a halted line can fire back onto, and the price of a
  line's fire stays the thing it is supposed to be — you must stop. What Open Order is for survives
  whole: it lives under round shot, it fires on the march at half the rate, it outwalks foot, and
  horse rides over it because it has no Face. The two Formations no longer meet in a fight only one
  of them can be in; they meet at 100m, where the screen is half a line's muskets loading at half its
  rate and comes off three times worse.

- **The attack column was strictly worse than a line at everything, including the one thing it
  exists for.** Depth was priced only as a liability and every one of those prices is right: round
  shot ploughs it (16.4 men a minute against a line's 4.7 under an eight-gun battery at 400m), a
  quarter of the Frontage means a quarter of the muskets bearing (28.2 a minute against 77.6), and
  a narrow front meets a narrow slice of whatever it charges. What was missing is anything on the
  other side of the ledger, so the Formation was a tax with no purchase — measured, a column sent
  at a line broke at 5.2 minutes having inflicted 36 casualties and taken 164. Worse, `reach` in C8
  is `width × files × min(ranks, 2) / frontage`, which is `width × 2 / spacing` for every infantry
  Formation alike: **depth contributed nothing whatever to a Contact**, so a column's charge was a
  *weaker* charge than a line's — it carried a steady line only at 0.08 Morale where a line's
  carried at 0.26. The one thing a column is for, it was worst at.

  Two halves, both derived. C3 hands C7 `backing` — the share of a Unit standing behind
  `ENGAGED_RANKS`, the ranks that are actually in the fight, which is the same fact C8 was already
  counting from the other end and is now the only place it is written down. A line is one rank
  deep behind its fight and a column is seven, so the men behind cannot see it coming, cannot run
  without going through the men behind *them*, and are pushing. And C8 reads `concentration` off
  the Contact it already measures: the Unit's own Frontage against the front the two actually met
  over, which is 1 for whichever side is narrower and therefore 1 for every Contact the design
  already had — cavalry is 200m wide and reads 1 against a line and 1 against a square, so nothing
  about what square is for moves.

  **Depth is worth nothing against fire and something against shock, and that is what keeps F10
  still.** Steadying a column against musketry was tried first and is the version that had to be
  thrown away: casualties are almost all fire, so it moved where every Formation Breaks by the men
  it has lost, and Castiglione promptly put a battalion out of the band at 33.3%. It is also wrong
  on its own terms — a column being shot at is not steadied by being deep, it is a bigger target
  for being deep, which C6 already charges it for. So `stiffening` is kept out of `steadiness` and
  spent only on `dread` and on the Contact. The budget run is then byte-identical to what it was,
  which is the whole of what it proves: the silent runs never Charge, so they show no collateral
  damage and cannot show the change working.

  What it buys: a column now carries a steady line at 0.21 Morale, exactly where a line's charge
  carries it, having dealt 11 casualties and taken 5 against a line-charge's 33 and 16 — the same
  hole punched for a third of the men, which is the trade. It is 1.47× harder to rush where a line
  is 1.20×. Everything it pays stands untouched: it is still ploughed by round shot, still fires a
  third of a line's Volley, and still dies crossing 400m of open ground in front of a battery. The
  Formation button has said *it goes in without coming apart* since C3 was written, and it is now
  a description rather than a hope.

  Two corners are outside where they were and are recorded rather than tuned: horse carries a line
  at 0.37 Morale rather than 0.44, because a line now has its own rank behind the fight to stand on
  — still a *shaken* line by the ladder's own words, and one notch further gone than it used to
  need. And a column is nearly as hard for cavalry to break frontally as a square (0.10 against
  0.08), which was true before this at 0.14 against 0.11 and is not what square is for anyway: a
  square has no flank, and a column struck off its Face still comes apart.

- **A square beat less of the ground round it than a line did, which is the exact inverse of what
  square is for.** A Face beats a slab — `across` metres wide, standing off its own edge, `range`
  deep — and that is right for a Unit with one of them and an artefact for a Unit with four,
  because four rectangles cannot tile a circle. What they left was not thin corners but blind
  ones. Measured on a square of 700, which is a 36m box: 118m dead ahead, 52m at twenty degrees,
  36m at thirty, and **nothing whatever at forty-five**. At 60m it beat 39% of the bearings around
  it against a line's 49% — the one Formation whose whole purpose is having no blind side coming
  off worse all round than the Formation that is all flank. It was exploitable in exactly the
  situation square exists for: horse closing on the diagonal was unengaged until 25m, so the
  correct way to charge a square was obliquely, for a reason that was never about squares.

  The tempting fix is `faces: 0`, and it would have destroyed the Formation twice over. The
  Faceless path hands out `overlap: 1` unconditionally, so a square would have fired every musket
  it had in every direction at once; and `struckSide` returns null for a Unit with no Face, so
  *any* Charge would have struck it off its Face and broken it outright. Square would have become
  the worst thing on the Field rather than the answer to horse.

  So the ground a Unit beats is read off the Face **count** and not off a Face: one Face is a
  slab, and anything with four beats the ground all round it exactly as a screen does — its own
  Footprint blown out by the range on every side. The Faces are still there and still doing the
  two jobs they were doing, which is the whole reason this is not the Faceless case: they decide
  which Face is firing along the bearing, and `overlap` still measures how much of it bears, now
  across the line of fire rather than across the Face. Nothing about how *much* a square shoots
  moves — one Face's muskets, and only as many of them as have the target across their front.
  What moves is that there is no longer a direction it cannot point them.

  Derived and not authored: the rule is `faces === 4` and would read the same for anything else
  that ever has four. Measured after: 118–125m on every bearing and 100% of them at 60m, with a
  line's 49% and an attack column's 13% untouched. The renderer draws the same lozenge it draws
  for a screen, because a beaten ground drawn where the fire is not is the one kind of lie F5
  cannot afford — its comment used to say the corners *stayed bare, as they were in life*, and
  that was the thing being argued with. The budget run is byte-identical, which is again the whole
  of what it proves: no square is ever formed in the silent runs, so they show no collateral
  damage and cannot show the change working.

- **F15's sound was cascaded off a stream that does not exist.** §4 says the sounds come *"off the
  same event stream that feeds Dispatches"*, which reads as though there is one. There is not: a
  `Dispatch` is `{at, unitId, army, text}` — a line of prose with no `kind` on it — pushed from
  twenty-one places across seven modules of `sim/`. Giving it a `kind` to hang sound off would have
  widened the wire and touched the whole simulation for a decoration, and been the second thing this
  design has done to C12 that C12 did not ask for.

  Built off the snapshot instead, which turns out to be the better half of the same idea. `volleys`
  and `contacts` are already events for exactly the step they happened in — which is what a sound
  *is* — and a Charge and a Rout are read as a Unit's state changing between two steps. **The cut
  then came free.** Volleys, Contacts, Charges and Routs are on the Field for both armies, so they
  sound for both; an Order arriving is read off a Courier, and a Courier is only ever on his own
  Commander's wire (F22), so the enemy's Orders are silent without a rule anywhere saying they must
  be. The How in §4 is amended to say the snapshot.

  Two things came out of building it. **The Commander's ears are at his Headquarters**, which is not
  a thing any row asked for and is the only honest answer available: F6 fixes the camera on the
  whole Field and never moves it, so there is no viewpoint to listen from, and the game already says
  where the man is standing. Fire near the staff is loud and fire a kilometre off is a murmur, and
  both change as he rides — ADR-0008's *where do I stand* with a second answer under it. And **an
  Order arriving is the one sound not quietened by distance**, because it is a cue to the Commander
  rather than a noise on the Field: an Order landing at the far end of the line is precisely the one
  he most needs to be told about.

- **A Volley was synthesised as one crack, which is one musket.** Six hundred men do not fire
  together: the word of command reaches them at slightly different moments, the sound rolls down the
  line, and it trails off in stragglers. The first version of `sound/` made a discharge a single
  noise burst, so a battalion and a lone skirmisher differed only in volume — and it was heard as
  such immediately. A discharge is now a dozen short cracks scattered across half a second, weighted
  to the front and each at its own pitch, and **it is the scattering and not the volume that makes
  it a battalion.** A battery rolls too, for the same reason and slower: several pieces on their own
  reload clocks.

  Distance turned out to do two things and only one of them is volume. High frequencies go first, so
  far fire is duller; and its cracks have smeared into each other, so it is longer and less
  articulate. That is most of what makes a battery a kilometre off read as a rolling boom rather
  than as a quiet bang — and it is cheap, because fewer cracks are needed to draw a sound that has
  already smeared, which is what keeps the voice count survivable when twenty-two battalions fire
  inside the same 100ms.

- **A discharge was five overlapping noise bursts, which is a noise generator.** The rolling fire
  above was right in shape and wrong in arithmetic: sixteen cracks landed about **20ms** apart and
  each was given a **70ms** decay, so five sounded at once for most of the discharge — and
  overlapping filtered white noise is filtered white noise. A 0.85s tail sat on top of it. So a
  Volley was nearly a second of continuous hiss, and it was heard as such the first time anybody
  played it. **A crack's decay has to be shorter than the gap between cracks**, which is the whole
  rule and was never written down: 20ms for a musket against a 20ms gap, 90ms for a gun, 35ms for
  the clatter of Contact, and the tails cut to a third. Peak overlap 5 → 2. A limiter now sits on
  the bus as well, because twenty-two battalions firing inside one 100ms can ask for more than one,
  and anything over one is not loudness but fuzz — which is heard as *the sound is broken* rather
  than as *the battle is loud*.

- **Synthesised ambience was built, heard as noise, and taken out.** A bed reading the whole
  Field's rate of fire into a roar, and the pas ordinaire beaten under it at 76 to the minute. Both
  were derived, both were period-defensible on paper, and both were wrong in the room: the verdict
  was *generated sounds are only for sound games*. What a synthesiser is genuinely good at is a
  discrete, physical, short event — a discharge is filtered noise and a filter is honest about it —
  and what it is bad at is anything continuous, because a continuous synthesised layer is by
  construction a noise generator left running. **The distinction is worth keeping**: the six event
  sounds stay synthesised and the ambience is now recorded tracks, which is the split the material
  itself argues for rather than a preference.

  Gone with them: `clamour` and its four assertions, the two bed layers, the beat scheduler, and the
  drums switch. What survived is the lesson in the entry below, which was always about the *events*.

- **The band is the only sound here that is not the battle.** Recorded music under it, looped
  through in turn: not derived from anything, because a Volley is heard when a Volley happened and
  this is a file somebody else wrote playing over the top. That is a real widening of F15 — *sound
  every battle event* does not cover it — and the honest reading is that **G7 wants a Function for
  atmosphere that F15 is not**. One row, not three, now that the bed and the drums are gone, which
  is a weaker case for a new Function than it was and the reason this is still a widening.

  Kept honest in four ways. **Streamed and never bundled** — tracks sit in `public/music/` and are
  named by an `index.json` there, the way `public/scenarios/index.json` names the battles, so the
  build is unchanged at 470KB and nothing is fetched until somebody asks. It ships **empty**, so the
  app has a band switch and no band and works exactly as well. The switch **says so** when the
  manifest is empty, because a control that does nothing and does not explain itself is worse than
  no control — that one was found by a player pressing it and hearing nothing. And every track's
  **licence is printed in Settings**, because attribution is a condition of most of the licences
  worth using and a credit nobody can find is not one.

  It is pulled down under the fighting by what was just *played* rather than by any reading of the
  battle, which is what let the bed go without taking the ducking with it.

- **Two places still read movement as displacement alone, and are left doing so.** A battalion
  wheeling on the spot covers no ground, so it fires while it turns — right for a battery, which
  traverses and then fires, and generous for a line mid-wheel. And a square at 0.25 m/s clears the
  threshold, so a square edging away from cavalry never fires, though fifteen metres a minute is a
  firing square in any account of the period. Both are known and neither is fixed here: the first
  wants facing changes to read as un-dressed, the second wants a speed below which a Unit counts
  as standing, and both are dials that would want a playtest to set.

---

## Annex — full roof grid

Symbols: `◎` strong reinforcement · `○` mild reinforcement · `×` mild conflict · `⊗` strong conflict.

|  | F1 | F2 | F3 | F4 | F5 | F6 | F7 | F8 | F9 | F10 | F11 | F12 | F13 | F14 | F15 | F16 | F17 | F18 | F19 | F20 | F21 | F22 | F23 | F24 |
| :-- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| **F1** | — | ◎ | ◎ |  |  |  |  |  |  |  | × |  |  |  | ○ |  |  |  |  |  | ○ |  |  |  |
| **F2** |  | — | ○ |  |  |  |  |  |  |  | ○ |  | × |  |  |  |  |  |  |  |  |  |  |  |
| **F3** |  |  | — |  |  |  | ◎ |  |  |  | ○ |  |  |  |  |  |  |  |  |  |  |  |  | ◎ |
| **F4** |  |  |  | — |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ○ |  |  |  |  |
| **F5** |  |  |  |  | — | × |  |  |  |  |  | ◎ | × |  |  |  |  |  |  |  |  |  |  |  |
| **F6** |  |  |  |  |  | — |  |  |  |  |  |  | × | ○ |  |  |  |  |  |  |  |  |  |  |
| **F7** |  |  |  |  |  |  | — | × |  |  |  |  |  |  |  |  |  |  |  |  |  | ⊗ |  |  |
| **F8** |  |  |  |  |  |  |  | — | ◎ | × | × |  |  |  |  |  |  | ◎ |  |  |  |  |  |  |
| **F9** |  |  |  |  |  |  |  |  | — |  |  |  | ◎ |  | ◎ |  |  |  |  |  |  |  |  |  |
| **F10** |  |  |  |  |  |  |  |  |  | — | ◎ |  |  |  |  |  |  |  |  |  |  |  |  |  |
| **F11** |  |  |  |  |  |  |  |  |  |  | — |  |  |  |  |  |  |  |  | × |  |  | × | ○ |
| **F12** |  |  |  |  |  |  |  |  |  |  |  | — |  | ◎ |  |  |  |  |  |  |  |  |  |  |
| **F13** |  |  |  |  |  |  |  |  |  |  |  |  | — | ○ |  |  |  |  |  |  |  |  |  |  |
| **F14** |  |  |  |  |  |  |  |  |  |  |  |  |  | — |  |  |  | × |  |  |  |  |  |  |
| **F15** |  |  |  |  |  |  |  |  |  |  |  |  |  |  | — |  |  |  |  |  |  |  |  |  |
| **F16** |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | — | ◎ |  |  | ◎ |  |  |  |  |
| **F17** |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | — | ○ |  |  |  |  |  |  |
| **F18** |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | — |  |  | × |  |  |  |
| **F19** |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | — |  | ⊗ |  |  |  |
| **F20** |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | — |  |  |  |  |
| **F21** |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | — | ◎ | ◎ | ◎ |
| **F22** |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | — | ◎ |  |
| **F23** |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | — |  |
| **F24** |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | — |

---

## How to keep this honest

- When a new ADR lands → add its components to §7 and re-score the affected rows.
- When a spike or a measurement returns numbers → update §8's `Target` and `Watched on`.
- Goals change rarely; Functions change with each release; the matrices are recomputed when either side moves.
- If a section goes empty after edits, delete it — empty sections lie.

